import assert from "node:assert/strict";
import { test } from "node:test";
import { fmuSolver, summary } from "../src/simulate/solver.ts";

test("an export keeps the Simulate solver as far as an FMU can", () => {
  assert.equal(fmuSolver({ method: "euler" }), "euler");
  assert.equal(fmuSolver({ method: "dassl" }), "cvode");
  assert.equal(summary({ method: "cvode", tolerance: 1e-8 }), "CVODE · 1e-8");
  assert.equal(summary({ method: "dassl" }), "DASSL · 1e-6");
  assert.equal(summary({ method: "rungekutta" }), "Runge–Kutta"); // fixed step: no tolerance
});

test("variables browser: a der() name keeps its der() under its group (#30)", async () => {
  const { groupOf, leafOf } = await import("../src/simulate/Simulate.tsx");
  assert.equal(groupOf("der(load.w)"), "load");
  assert.equal(leafOf("der(load.w)"), "der(w)");
  assert.equal(leafOf("der(emf.phi)"), "der(phi)");
  assert.equal(groupOf("der(x)"), ""); // a top-level state's derivative stays at the top, with it
  assert.equal(leafOf("der(x)"), "der(x)");
  assert.equal(leafOf("R1.v"), "v");
  assert.equal(leafOf("R1.p.i"), "p.i");
});
