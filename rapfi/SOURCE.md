# Rapfi WebAssembly component

This directory contains an unmodified WebAssembly build of the Rapfi engine.
Rapfi is distributed under GNU GPL version 3; see `COPYING.txt`. The network
configuration and weight are distributed under CC0; see
`NETWORKS-LICENSE.txt`.

## Exact source

- Rapfi: commit `3aedf3a2ab0ab710a9f3d00e57d5287ceb864894`
  - https://github.com/dhbloo/rapfi/tree/3aedf3a2ab0ab710a9f3d00e57d5287ceb864894
- Rapfi Networks: commit `918b757a129258e9e765f77fe17d507c2bb1a60b`
  - https://github.com/dhbloo/rapfi-networks/tree/918b757a129258e9e765f77fe17d507c2bb1a60b

No Rapfi source files were modified. The build used emsdk `6.0.5`, Release,
single-threaded WebAssembly, standard SIMD128, no command modules, and no
relaxed SIMD. The preload manifest was limited to the Freestyle assets used by
this application:

```text
config-example/gomocalc-mix9svq.toml@config.toml
classical/model210901.bin@model210901.bin
mix9svq/mix9svqfreestyle_bsmix.bin.lz4@mix9svqfreestyle_bsmix.bin.lz4
```

The CMake options were:

```text
-DCMAKE_BUILD_TYPE=Release
-DNO_MULTI_THREADING=ON
-DNO_COMMAND_MODULES=ON
-DUSE_SSE=OFF
-DUSE_AVX2=OFF
-DUSE_AVX512=OFF
-DUSE_BMI2=OFF
-DUSE_VNNI=OFF
-DUSE_NEON=OFF
-DUSE_NEON_DOTPROD=OFF
-DUSE_WASM_SIMD=ON
-DUSE_WASM_SIMD_RELAXED=OFF
```

## Distributed artifact checksums

```text
e7a6f22f99077bae5ff7dd1626d49733c554e87c6aef9e500339f5d7d641222a  rapfi-single-simd128.js
e746664530b4ddd5f2c7c6af611c36d832700c6ae8311f1afed4e7ed229d92fb  rapfi-single-simd128.wasm
472d3c9459cac77bf5937162eefc1faadfaefe296e361f756370142e7765e1df  rapfi-single-simd128.data
```
