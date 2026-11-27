import assert from "node:assert/strict";
import { test } from "node:test";
import { relPath, defaultOut, exportKinds, importKinds, linearBlock, moMatrix, parseSet, runCsv } from "../src/transfer/Transfer.tsx";

test("the operating point: name = number, comma-separated; anything else is named", () => {
  assert.deepEqual(parseSet("alpha0=0, km = 0.04"), { set: { alpha0: "0", km: "0.04" } });
  assert.deepEqual(parseSet(""), { set: {} });
  assert.equal(parseSet("alpha0=0, x=sin(1)").bad, "x=sin(1)");
  assert.deepEqual(parseSet("pendulum.m=1e-3").set, { "pendulum.m": "1e-3" });
});

test("exports land where they belong: stations/, the model's out/, runs/", () => {
  assert.equal(defaultOut("station", "Furuta.Rig", "model"), "stations/rig.pst");
  assert.equal(defaultOut("linear-station", "Furuta.Pendulum", "model"), "stations/pendulum-linear.pst");
  assert.equal(defaultOut("linear", "Furuta.Pendulum", "model", "python"), "model/out/Pendulum-lin.py");
  assert.equal(defaultOut("fmu", "Furuta.Rig", ""), "out/Furuta.Rig.fmu");
  assert.match(defaultOut("results", "DCMotor", "models"), /^runs\/\d{4}-\d\d-\d\d_dc-motor\/run\.csv$/);
});

test("a run as CSV: time, then each series; a missing value is empty", () => {
  assert.equal(runCsv({ t: [0, 0.5], series: { theta: [0, 0.1], alpha: [3, null] } }), "time,theta,alpha\n0,0,3\n0.5,0.1,\n");
});

test("a linear import: K alone is u = −K x, A, B, C, D a StateSpace", () => {
  assert.equal(moMatrix([[1, 2], [3, 4]]), "[1, 2; 3, 4]");
  assert.equal(moMatrix([1, 2]), "[1, 2]");
  assert.deepEqual(linearBlock({ K: [-9.6, -80.8, -4, -7.6], Ts: 0.002 }), { cls: "Modelica.Blocks.Math.MatrixGain", mods: { K: "[9.6, 80.8, 4, 7.6]" } });
  const ss = linearBlock({ A: [[0, 1], [-2, -3]], B: [[0], [1]], C: [[1, 0]], D: [[0]] });
  assert.deepEqual(ss, { cls: "Modelica.Blocks.Continuous.StateSpace", mods: { A: "[0, 1; -2, -3]", B: "[0; 1]", C: "[1, 0]", D: "[0]" } });
  assert.deepEqual(linearBlock({ Ts: 1 }), { why: "the file has neither K nor A, B, C and D" });
});

test("a kind that can't be chosen says why", () => {
  assert.equal(exportKinds({ run: null }).find((k) => k.id === "station")?.why, "open a model first");
  const model = { name: "M", components: [], connections: [], params: [], entries: [], connectors: {} };
  const kinds = exportKinds({ model, run: null, stationWhy: "add an input first" });
  assert.equal(kinds.find((k) => k.id === "station")?.why, "add an input first");
  assert.equal(kinds.find((k) => k.id === "results")?.why, "simulate first");
  assert.equal(kinds.find((k) => k.id === "fmu")?.why, undefined);
  assert.match(importKinds(model).find((k) => k.id === "fmu")?.why ?? "", /importFMU/);
});

test("a path from a folder: up to the common part, then down", () => {
  assert.equal(relPath("/h/lab/model", "/h/lab/runs/e2/id.csv"), "../runs/e2/id.csv");
  assert.equal(relPath("/h/lab/model", "/h/lab/model/data/id.csv"), "data/id.csv");
  assert.equal(relPath("/h/lab/model/", "/h/lab/model/x.csv"), "x.csv");
});
