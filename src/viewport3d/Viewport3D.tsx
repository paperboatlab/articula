// The 3D view of a MultiBody run (#44): omc's visual shapes on the kit's stage (@paperboatlab/ui/stage), played back
// against the run's time with a scrubber. Orbit with the left button, pan with the right, zoom on wheel.

import { useEffect, useMemo, useState } from "react";
import { Key } from "@paperboatlab/ui";
import { AXIS_COLORS, SceneView, type Entity, type View } from "@paperboatlab/ui/stage";
import { bounds, entityMatrix, KIT_SIZE, kitShape, sampleAt, type Shape, type Value } from "./shapes.ts";

export type ShapeRun = { t: number[]; series: Record<string, (number | null)[]>; shapes?: Shape[] };

const SPEEDS = [0.5, 1, 2, 5];
let runs = 0;
const FOV = 45;
const hex = (c: number) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0");
// the world axes: three plain lines from the origin, in the kit's axis colours (x red, y green, z blue)
const AXES = [["x", [1, 0, 0], AXIS_COLORS.x], ["y", [0, 1, 0], AXIS_COLORS.y], ["z", [0, 0, 1], AXIS_COLORS.z]] as const;

export function Viewport3D({ run, theme }: { run: ShapeRun; theme: string }) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [projection, setProjection] = useState<"persp" | "iso">("persp");
  const [grid, setGrid] = useState(true);
  const [axes, setAxes] = useState(true);
  // F remounts the stage: the camera goes back to the fitted view, which the cube takes as Home
  const [fits, setFits] = useState(0);
  const runNo = useMemo(() => ++runs, [run]); // the stage reads its view once: a new run remounts it
  const end = run.t[run.t.length - 1] ?? 0;

  // the World's own arrows and letters (world.x_arrowLine, world.gravityArrow…): the plain axes stand in
  const shapes = useMemo(() => (run.shapes ?? []).filter((s) => !s.ident.startsWith("world.")), [run]);
  // the view: fitted to the shapes at t = 0, the floor under them
  const { view, reach } = useMemo(() => {
    const at = (v: Value) => (typeof v === "number" ? v : (run.series[v]?.[0] ?? 0));
    const [lo, hi] = bounds(shapes, at);
    const centre = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) as [number, number, number];
    const size = Math.max(0.5, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
    const eye = [centre[0] + 0.6 * size, centre[1] + 0.5 * size, centre[2] + size] as [number, number, number];
    const view: View = { mode: "3d", floor: lo[1] - 0.01, camera: { eye, target: centre, fov: FOV } };
    return { view, reach: size * 0.3 };
  }, [run, shapes]);

  const entities = useMemo(() => {
    const i = sampleAt(run.t, time);
    const at = (v: Value) => (typeof v === "number" ? v : (run.series[v]?.[i] ?? 0));
    const out: Record<string, Entity> = {};
    shapes.forEach((s, k) => {
      const shape = kitShape(s.type);
      const id = `${k}:${s.ident}`;
      const color = "#" + s.color.map((v) => hex(typeof v === "number" ? v : 128)).join("");
      out[id] = { id, shape, pos: [0, 0, 0], size: [...KIT_SIZE[shape]], matrix: entityMatrix(s, at), color, opacity: s.type === "spring" ? 0.5 : undefined };
    });
    if (axes)
      for (const [name, dir, color] of AXES)
        out[`axis:${name}`] = { id: `axis:${name}`, shape: "line", pos: [0, 0, 0], to: [dir[0] * reach, dir[1] * reach, dir[2] * reach], color, overlay: true };
    return out;
  }, [run, shapes, time, axes, reach]);

  // the clock: simulation time runs at `speed` × wall time
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next <= end) return next;
        if (loop) return 0;
        setPlaying(false);
        return end;
      });
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, loop, end]);

  if (!run.shapes?.length) return null;
  const step = end / Math.max(1, run.t.length - 1);
  return (
    <section
      className="viewport3d"
      aria-label="3D view"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "f" || e.key === "F") setFits((n) => n + 1);
        if (e.key === " ") e.preventDefault(), setPlaying((p) => !p);
      }}
    >
      <div className="viewport3d-bar" role="toolbar" aria-label="Playback">
        <Key size="sm" round icon={playing ? "debug-pause" : "play"} label={playing ? "Pause" : "Play"} onClick={() => (time >= end && setTime(0), setPlaying(!playing))} />
        <Key size="sm" round icon="debug-step-over" label="Step forward" onClick={() => (setPlaying(false), setTime((t) => Math.min(end, t + step)))} />
        <input type="range" className="viewport3d-scrub" aria-label="Time" min={0} max={end} step={step || 0.001} value={time} onChange={(e) => (setPlaying(false), setTime(Number(e.target.value)))} />
        <span className="lbl mono">{time.toFixed(2)} s</span>
        <select className="well" aria-label="Speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
        <label className="lbl">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop
        </label>
        <span className="sep" />
        <Key size="sm" aria-pressed={projection === "iso"} title={projection === "iso" ? "Isometric (parallel) view: click for Perspective" : "Perspective view: click for Isometric (parallel)"} onClick={() => setProjection((p) => (p === "iso" ? "persp" : "iso"))}>
          {projection === "iso" ? "Iso" : "Persp"}
        </Key>
        <Key size="sm" aria-pressed={grid} title="Show or hide the floor grid" onClick={() => setGrid((g) => !g)}>Grid</Key>
        <Key size="sm" aria-pressed={axes} title="Show or hide the world axes (x red, y green, z blue)" onClick={() => setAxes((a) => !a)}>Axes</Key>
      </div>
      <div className="viewport3d-scene" title="Drag to orbit, right-drag to pan, wheel to zoom, F to frame; the cube turns the view, Home returns">
        <SceneView key={`${theme}:${runNo}:${fits}`} entities={entities} view={view} grid={grid} projection={projection} />
      </div>
    </section>
  );
}
