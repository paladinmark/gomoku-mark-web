(function exposeRapfiDiagnostics(scope) {
  const NODE_MULTIPLIERS = Object.freeze({
    "": 1,
    K: 1_000,
    M: 1_000_000,
    G: 1_000_000_000,
    T: 1_000_000_000_000,
  });
  const TIME_MULTIPLIERS = Object.freeze({
    ms: 1,
    s: 1_000,
    min: 60_000,
    h: 3_600_000,
  });
  const SEARCH_SUMMARY =
    /^MESSAGE Speed \S+ \| Depth (\d+)-(\d+) \| Eval .+ \| Node (\d+)([KMGT]?) \| Time (\d+)(ms|s|min|h)$/;

  function parseMove(value, boardSize) {
    const match = /^(\d+),(\d+)$/.exec(value);
    if (match === null) throw new Error(`Invalid Rapfi coordinate: ${value}`);
    const move = { x: Number(match[1]), y: Number(match[2]) };
    if (move.x >= boardSize || move.y >= boardSize) {
      throw new Error(`Rapfi coordinate is out of bounds: ${value}`);
    }
    return move;
  }

  function parseDetailNumber(line, prefix) {
    if (!line.startsWith(prefix)) return undefined;
    const value = Number(line.slice(prefix.length));
    if (!Number.isFinite(value)) {
      throw new Error(`Rapfi returned a non-finite value: ${line}`);
    }
    return value;
  }

  function completePv(block) {
    // Rapfi's no-root-move loss path emits a complete depth-zero -M0 block
    // with an explicitly empty BESTLINE, followed by a fallback move. Core
    // must still validate that move; other empty/incomplete PVs stay invalid.
    if (
      block.depth === 0 &&
      block.selectiveDepth === 0 &&
      block.nodes === 0 &&
      block.evaluation === "-M0" &&
      block.winRate === 0 &&
      Array.isArray(block.principalVariation) &&
      block.principalVariation.length === 0
    ) {
      return block;
    }
    if (
      !Number.isInteger(block.depth) ||
      block.depth < 1 ||
      !Number.isInteger(block.selectiveDepth) ||
      block.selectiveDepth < 0 ||
      !Number.isInteger(block.nodes) ||
      block.nodes < 0 ||
      block.evaluationSeen !== true ||
      !Number.isFinite(block.winRate) ||
      block.winRate < 0 ||
      block.winRate > 1 ||
      !Array.isArray(block.principalVariation) ||
      block.principalVariation.length === 0
    ) {
      throw new Error("Rapfi completed an incomplete PV detail block");
    }
    return block;
  }

  function parse(lines, limits) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const match = SEARCH_SUMMARY.exec(lines[index]);
      if (match === null) continue;

      const completedDepth = Number(match[1]);
      const selectiveDepth = Number(match[2]);
      const nodeUnit = match[4];
      const timeUnit = match[6];
      const nodesVisited = Number(match[3]) * NODE_MULTIPLIERS[nodeUnit];
      const searchTimeMs = Number(match[5]) * TIME_MULTIPLIERS[timeUnit];
      const terminationReason =
        completedDepth >= limits.maxDepth
          ? "DEPTH_LIMIT_REACHED"
          : limits.maxNodes > 0 && nodesVisited >= limits.maxNodes
            ? "NODE_LIMIT_REACHED"
            : "ENGINE_OR_TIME_CONTROL";

      return {
        nodesVisited,
        cacheHits: 0,
        cacheStores: 0,
        completedDepth,
        selectiveDepth,
        searchTimeMs,
        metricsAvailable: true,
        metricsApproximate: nodeUnit !== "" || timeUnit !== "ms",
        terminationReason,
      };
    }

    return {
      nodesVisited: 0,
      cacheHits: 0,
      cacheStores: 0,
      metricsAvailable: false,
    };
  }

  function parseAnalysis(
    lines,
    limits,
    boardSize = 15,
    allowRootMoveOnly = false
  ) {
    const engineError = lines.find((line) => line.startsWith("ERROR "));
    if (engineError !== undefined) {
      throw new Error(`Rapfi protocol error: ${engineError}`);
    }

    let current = null;
    let completed = null;
    for (const line of lines) {
      if (line === "INFO PV 0") {
        current = {};
        continue;
      }
      if (line === "INFO PV DONE") {
        if (current !== null) completed = completePv(current);
        current = null;
        continue;
      }
      if (current === null) continue;

      current.depth = parseDetailNumber(line, "INFO DEPTH ") ?? current.depth;
      current.selectiveDepth =
        parseDetailNumber(line, "INFO SELDEPTH ") ?? current.selectiveDepth;
      current.nodes =
        parseDetailNumber(line, "INFO TOTALNODES ") ?? current.nodes;
      current.winRate =
        parseDetailNumber(line, "INFO WINRATE ") ?? current.winRate;
      if (line.startsWith("INFO EVAL ")) {
        current.evaluationSeen = true;
        current.evaluation = line.slice("INFO EVAL ".length);
      }
      if (line === "INFO BESTLINE" || line.startsWith("INFO BESTLINE ")) {
        current.principalVariation = line
          .slice("INFO BESTLINE ".length)
          .split(/\s+/)
          .filter(Boolean)
          .map((move) => parseMove(move, boardSize));
      }
    }

    const finalMoveLine = [...lines]
      .reverse()
      .find((line) => /^\d+,\d+$/.test(line));
    if (finalMoveLine === undefined) {
      throw new Error("Rapfi did not return a final move");
    }
    if (completed === null && !allowRootMoveOnly) {
      throw new Error("Rapfi did not complete a detailed PV depth");
    }

    const reportedFinalMove = parseMove(finalMoveLine, boardSize);
    const diagnostics = parse(lines, limits);
    // At a node or time boundary Rapfi may print a trailing move from the
    // in-progress depth after the last complete detail block. The completed
    // PV is the stable, replayable result; keep the trailing coordinate bounds
    // check but do not let that incomplete move invalidate the PV. If the
    // search ended at a completed depth, or has no boundary summary, retain
    // the strict mismatch failure.
    const principalVariation = completed?.principalVariation.length
      ? completed.principalVariation
      : [reportedFinalMove];
    const bestMove = principalVariation[0];
    if (bestMove === undefined) {
      throw new Error("Rapfi did not return a principal variation");
    }
    if (
      completed !== null &&
      (bestMove.x !== reportedFinalMove.x || bestMove.y !== reportedFinalMove.y) &&
      !["NODE_LIMIT_REACHED", "ENGINE_OR_TIME_CONTROL"].includes(
        diagnostics.terminationReason
      )
    ) {
      throw new Error("Rapfi final move does not match the last completed PV");
    }
    const completedDepth = completed?.depth ?? diagnostics.completedDepth;
    const selectiveDepth =
      completed?.selectiveDepth ?? diagnostics.selectiveDepth;
    return {
      bestMove,
      principalVariation,
      search: {
        ...(completedDepth === undefined ? {} : { completedDepth }),
        ...(selectiveDepth === undefined ? {} : { selectiveDepth }),
        nodes: completed?.nodes ?? diagnostics.nodesVisited,
        elapsedMs: diagnostics.searchTimeMs ?? 0,
        ...(diagnostics.terminationReason === undefined
          ? {}
          : { terminationReason: diagnostics.terminationReason }),
      },
    };
  }

  scope.RapfiDiagnostics = Object.freeze({ parse, parseAnalysis });
})(self);
