# Rapfi classical WebAssembly component

This directory contains the same fixed Rapfi source build documented in
`../SOURCE.md`, packaged with only the classical 210901 Freestyle evaluator
for the EXPERT product tier. The parent directory contains the GPLv3 and CC0
license texts.

The preload manifest is:

```text
config-example/gomocalc-classical210901.toml@config.toml
classical/model210901.bin@model210901.bin
```

Distributed artifact SHA-256 checksums:

```text
f95675f0f71160e47c1d94cad4ebca5454b0d784bf7bfd74cfcb49996d596704  rapfi-single-simd128.js
e746664530b4ddd5f2c7c6af611c36d832700c6ae8311f1afed4e7ed229d92fb  rapfi-single-simd128.wasm
9e337777f8a2096925963accdec211ed13436fcc58ce422d9550253ce3a16904  rapfi-single-simd128.data
```
