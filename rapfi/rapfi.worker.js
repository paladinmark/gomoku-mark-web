/* global RapfiLoader, RapfiDiagnostics */

importScripts(new URL('./rapfi-loader.js', self.location.href).href + self.location.search);

const MAX_MEMORY_BYTES = 128 * 1024 * 1024;
let stdoutSink = null;
let stderrSink = null;
let modulePromise = null;

function receiveLine(sink, line) {
  if (sink !== null) sink.push(line.trim());
}

function loadRapfi() {
  if (modulePromise === null) {
    modulePromise = RapfiLoader.load({
      onReceiveStdout: (line) => receiveLine(stdoutSink, line),
      onReceiveStderr: (line) => receiveLine(stderrSink, line),
    }, './rapfi-diagnostics.js').then((module) => {
      for (const command of [
        "START 15",
        "YXSHOWINFO",
        "INFO rule 0",
        `INFO max_memory ${MAX_MEMORY_BYTES}`,
        "INFO show_detail 0",
      ]) {
        module.sendCommand(command);
      }
      return module;
    });
  }
  return modulePromise;
}

function boardCommand(state) {
  return [
    "BOARD",
    ...state.history.map((move) => {
      const owner = move.player === state.currentPlayer ? 1 : 2;
      return `${move.x},${move.y},${owner}`;
    }),
    "DONE",
  ].join("\n");
}

function parseBestMove(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = /^(\d+),(\d+)$/.exec(lines[index]);
    if (match !== null) {
      return { x: Number(match[1]), y: Number(match[2]) };
    }
  }
  throw new Error("Rapfi did not return a move");
}

self.onmessage = async ({ data: request }) => {
  if (request.type === "CANCEL" || request.type === "CANCEL_ANALYSIS") return;

  if (request.type === "PREPARE" || request.type === "PREPARE_ANALYSIS") {
    try {
      await loadRapfi();
      self.postMessage({
        type: request.type === "PREPARE" ? "READY" : "ANALYSIS_READY",
        requestId: request.requestId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage(
        request.type === "PREPARE"
          ? { type: "ERROR", requestId: request.requestId, message }
          : {
              type: "ANALYSIS_ERROR",
              requestId: request.requestId,
              code: error.code || "PREPARE_ERROR",
              message,
            }
      );
    }
    return;
  }

  const isAnalysis = request.type === "ANALYZE_POSITION";
  const stdout = [];
  const stderr = [];
  stdoutSink = stdout;
  stderrSink = stderr;
  let analysisErrorCode = "WORKER_ERROR";

  try {
    if (request.state.board.size !== 15 || request.state.ruleSet !== "FREESTYLE") {
      analysisErrorCode = "UNSUPPORTED_POSITION";
      throw new Error("Rapfi Worker only supports 15x15 Freestyle");
    }
    const module = await loadRapfi();
    const rapfiMaxDepth = isAnalysis
      ? request.preset.maxDepth
      : request.config.rapfiMaxDepth;
    const rapfiMaxNodes = isAnalysis
      ? request.preset.maxNodes
      : request.config.rapfiMaxNodes;
    if (
      !Number.isInteger(rapfiMaxDepth) ||
      rapfiMaxDepth < 2 ||
      !Number.isInteger(rapfiMaxNodes) ||
      rapfiMaxNodes < 0
    ) {
      throw new Error("Invalid Rapfi capability");
    }
    module.sendCommand("INFO rule 0");
    module.sendCommand(`INFO max_depth ${rapfiMaxDepth}`);
    module.sendCommand(`INFO max_node ${rapfiMaxNodes}`);
    module.sendCommand(`INFO show_detail ${isAnalysis ? 2 : 0}`);
    const remainingMs = Math.max(
      1,
      Math.floor(
        request.deadline -
          (performance.timeOrigin + performance.now()) -
          100
      )
    );
    module.sendCommand(`INFO timeout_turn ${remainingMs}`);
    module.sendCommand(boardCommand(request.state));
    const errors = stderr.filter(Boolean);
    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
    const limits = {
      maxDepth: rapfiMaxDepth,
      maxNodes: rapfiMaxNodes,
    };
    if (isAnalysis) {
      analysisErrorCode = "INVALID_RESULT";
      const analysis = RapfiDiagnostics.parseAnalysis(
        stdout,
        limits,
        15,
        request.state.history.length === 0
      );
      self.postMessage({
        type: "ANALYSIS_RESULT",
        requestId: request.requestId,
        result: {
          positionFingerprint: request.positionFingerprint,
          bestMove: analysis.bestMove,
          principalVariation: analysis.principalVariation,
          engineUsed: "RAPFI",
          assetId: "mix9",
          presetId: request.preset.id,
          search: analysis.search,
        },
      });
    } else {
      self.postMessage({
        type: "RESULT",
        requestId: request.requestId,
        move: parseBestMove(stdout),
        diagnostics: RapfiDiagnostics.parse(stdout, limits),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage(
      isAnalysis
        ? {
            type: "ANALYSIS_ERROR",
            requestId: request.requestId,
            code: analysisErrorCode,
            message,
          }
        : { type: "ERROR", requestId: request.requestId, message }
    );
  } finally {
    stdoutSink = null;
    stderrSink = null;
  }
};
