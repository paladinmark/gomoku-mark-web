/* global Rapfi */
// Own both downloads: Emscripten's data preload can otherwise reject separately
// while module initialization keeps waiting, hiding HTTP errors behind a timeout.
self.RapfiLoader = {
  async load(options, diagnosticsPath) {
    const assetUrl = (name) => {
      const url = new URL(name, self.location.href);
      const revision = new URL(self.location.href).searchParams.get('assets');
      if (revision) url.searchParams.set('assets', revision);
      return url.href;
    };
    try {
      importScripts(assetUrl(diagnosticsPath), assetUrl('./rapfi-single-simd128.js'));
    } catch {
      throw Object.assign(new Error('Unable to load Rapfi scripts'), { code: 'PREPARE_SCRIPT_ERROR' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const download = async (name) => {
      try {
        const response = await fetch(assetUrl(name), { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.arrayBuffer();
      } catch (error) {
        const timedOut = controller.signal.aborted;
        throw Object.assign(new Error(`${name}: ${timedOut ? 'download timed out' : error.message}`),
          { code: timedOut ? 'PREPARE_TIMEOUT' : 'PREPARE_ASSET_ERROR' });
      }
    };
    let binaries;
    try {
      binaries = await Promise.all([download('rapfi-single-simd128.wasm'), download('rapfi-single-simd128.data')]);
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
    try {
      return await Rapfi({ ...options, locateFile: assetUrl,
        wasmBinary: new Uint8Array(binaries[0]), getPreloadedPackage: () => binaries[1] });
    } catch {
      throw Object.assign(new Error('Rapfi WebAssembly initialization failed'), { code: 'PREPARE_ENGINE_ERROR' });
    }
  },
};
