// A MultiBody shape from omc's _visual.xml (the server's `shapes`) placed at one instant: pure math,
// no three.js, so a node test checks it.

/** A number, or the result variable whose series drives it. */
export type Value = number | string;

export type Shape = {
  ident: string;
  type: string; // box, cylinder, sphere, cone, pipecylinder, beam, gearwheel, spring, file://…
  T: Value[]; // 9, row-major: world → shape frame
  r: Value[]; // 3, frame origin in world
  r_shape: Value[]; // 3, shape origin in the frame
  lengthDir: Value[];
  widthDir: Value[];
  length: Value;
  width: Value;
  height: Value;
  extra: Value;
  color: Value[]; // 0..255
};

type Vec = [number, number, number];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec): Vec => {
  const n = Math.hypot(...a);
  return n > 1e-12 ? scale(a, 1 / n) : [0, 0, 0];
};

/**
 * The shape's 4×4 at sample `i`, column-major (three.js `Matrix4.fromArray`): it maps a unit shape
 * (x along the length from 0 to 1, y and z centred, size 1) to world. `at` reads a value at `i`.
 */
export function shapeMatrix(s: Shape, at: (v: Value) => number): number[] {
  const v3 = (a: Value[]): Vec => [at(a[0] ?? 0), at(a[1] ?? 0), at(a[2] ?? 0)];
  const T = s.T.map(at);
  const toWorld = (u: Vec): Vec => [T[0] * u[0] + T[3] * u[1] + T[6] * u[2], T[1] * u[0] + T[4] * u[1] + T[7] * u[2], T[2] * u[0] + T[5] * u[1] + T[8] * u[2]];
  const ex = unit(v3(s.lengthDir));
  let ey = unit(sub(v3(s.widthDir), scale(ex, dot(v3(s.widthDir), ex))));
  if (!Math.hypot(...ey)) ey = unit(cross(ex, Math.abs(ex[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const ez = cross(ex, ey);
  const [X, Y, Z] = [toWorld(scale(ex, at(s.length))), toWorld(scale(ey, at(s.width))), toWorld(scale(ez, at(s.height)))];
  const r = v3(s.r);
  const p = toWorld(v3(s.r_shape));
  return [...X, 0, ...Y, 0, ...Z, 0, r[0] + p[0], r[1] + p[1], r[2] + p[2], 1];
}

// ponytail: the sample at or before `time`, no interpolation; 500 samples a run look smooth enough
export function sampleAt(t: number[], time: number): number {
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * shapeMatrix for the kit's stage (`@paperboatlab/ui/stage`), whose unit shapes are centred on the origin, a cylinder or
 * cone along y: shift by half the length, and turn y onto x for the round ones. Pairs with `kitShape`.
 */
export function entityMatrix(s: Shape, at: (v: Value) => number): number[] {
  const m = shapeMatrix(s, at);
  const [X, Y, Z, P] = [m.slice(0, 3), m.slice(4, 7), m.slice(8, 11), m.slice(12, 15)];
  const p = [P[0] + X[0] / 2, P[1] + X[1] / 2, P[2] + X[2] / 2];
  // Rz(-90°): the unit's +y (a cone's tip) goes along the length (X), its x along -Y
  const round = kitShape(s.type) === "cylinder" || kitShape(s.type) === "cone";
  const cols = round ? [Y.map((n) => -n), X, Z] : [X, Y, Z];
  return [...cols[0], 0, ...cols[1], 0, ...cols[2], 0, ...p, 1];
}

/** The kit shape that draws an omc one; KIT_SIZE sizes it to shapeMatrix's unit (length 1, width 1). */
export function kitShape(type: string): "box" | "sphere" | "cylinder" | "cone" {
  if (type === "sphere") return "sphere";
  if (type === "cone") return "cone";
  if (type === "cylinder" || type === "pipecylinder" || type === "pipe" || type === "gearwheel" || type === "spring") return "cylinder";
  // ponytail: beam and file:// CAD parts draw as their box; load meshes when CAD import lands (#44 §4)
  return "box";
}

export const KIT_SIZE = { box: [1, 1, 1], sphere: [0.5, 0.5, 0.5], cylinder: [0.5, 1, 0.5], cone: [0.5, 1, 0.5] } as const;

/** The world box [min, max] around the shapes at sample `at`: the unit's eight corners through shapeMatrix. */
export function bounds(shapes: Shape[], at: (v: Value) => number): [Vec, Vec] {
  const lo: Vec = [Infinity, Infinity, Infinity];
  const hi: Vec = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) {
    const m = shapeMatrix(s, at);
    for (const x of [0, 1]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5])
      for (let k = 0; k < 3; k++) {
        const w = m[k] * x + m[4 + k] * y + m[8 + k] * z + m[12 + k];
        lo[k] = Math.min(lo[k], w);
        hi[k] = Math.max(hi[k], w);
      }
  }
  return shapes.length ? [lo, hi] : [[0, 0, 0], [0, 0, 0]];
}
