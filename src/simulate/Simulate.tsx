// Simulate: a run with omc in the workspace's session (Ctrl R, or the bar's Simulate), its setup in one
// row (stop time, the solver), a plot of the variables checked, and the variables browser (OMEdit's,
// with a filter, grouped by component, each with its final value).

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, Key, NumberField, Spinner, readStored, writeStored, type Toast } from "@paperboatlab/ui";
import { Plot2D, type PlotAxes } from "@paperboatlab/ui/plot";
import { SolverSettings } from "./SolverSettings.tsx";
import { DEFAULTS, loadSolver, OPTIONS, saveSolver, SOLVERS, summary, type SolverChoice } from "./solver.ts";
import type { StudioModel } from "../model/types.ts";
import type { Actions, Stimulus } from "../store/index.tsx";
import { explainOmcError } from "../dock/dock.ts";

const PLOT_AXES: PlotAxes = { xlabel: { text: "time (s)" }, grid: true, legend: { show: true } };
const isList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

type Run = Awaited<ReturnType<Actions["simulate"]>>;

/** The variables worth plotting first: not derivatives, fewest dots, a few of them. */
export function defaultPicks(names: string[], limit = 3): string[] {
  return [...names]
    .filter((n) => n !== "time" && !n.startsWith("der("))
    .sort((a, b) => a.split(".").length - b.split(".").length || a.localeCompare(b))
    .slice(0, limit);
}

/** Why the model won't balance, in words: a top-level output wired to nothing has no equation. */
export function outputWarnings(model: StudioModel): string[] {
  return model.entries
    .filter((e) => e.kind === "output" && !e.target)
    .map((e) => `${e.name} isn't wired to anything: an output needs an equation, so the model is unbalanced. Wire it to a port or remove it.`);
}

const KINDS: Stimulus["kind"][] = ["constant", "step", "ramp", "sine"];
const K_LABEL: Record<Stimulus["kind"], string> = { constant: "value", step: "height", ramp: "slope", sine: "amp" };

/** One row per top-level input: what drives it in this local run (nothing is exported). */
function Stimuli({ inputs, value, onChange }: { inputs: string[]; value: Record<string, Stimulus>; onChange: (v: Record<string, Stimulus>) => void }) {
  if (!inputs.length) return null;
  return (
    <div className="stimuli" role="group" aria-label="Input stimuli">
      {inputs.map((name) => {
        const s = value[name] ?? { kind: "constant", k: 0 };
        const set = (patch: Partial<Stimulus>) => onChange({ ...value, [name]: { ...s, ...patch } });
        return (
          <div key={name} className="stimulus">
            <span className="lbl mono">{name}</span>
            <select className="well" aria-label={`Stimulus for ${name}`} value={s.kind} onChange={(e) => set({ kind: e.target.value as Stimulus["kind"], ...(s.k === 0 && e.target.value !== "constant" ? { k: 1 } : {}) })}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <span className="lbl">{K_LABEL[s.kind]}</span>
            <NumberField className="well" aria-label={`${name} ${K_LABEL[s.kind]}`} value={s.k} onChange={(k) => set({ k })} />
            {(s.kind === "step" || s.kind === "ramp") && (
              <>
                <span className="lbl">at t</span>
                <NumberField className="well" aria-label={`${name} start time`} value={s.t0 ?? 0} onChange={(t0) => set({ t0 })} />
              </>
            )}
            {s.kind === "sine" && (
              <>
                <span className="lbl">Hz</span>
                <NumberField className="well" aria-label={`${name} frequency`} value={s.f ?? 1} onChange={(f) => set({ f })} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Where a variable lives: its first path segment groups it ("R1.v" under R1; "time" alone). */
const groupOf = (n: string) => (n.startsWith("der(") ? n.slice(4).split(".")[0] : n.includes(".") ? n.slice(0, n.indexOf(".")) : "");
const fmt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(3) : String(+v.toPrecision(5)));

/** The variables browser (OMEdit's, with a filter): every result variable grouped by its component,
 *  a check plots it, its final value at the end. */
function Variables({ run, picks, onPicks }: { run: Run | null; picks: string[]; onPicks: (p: string[]) => void }) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!run) return <p className="vars-none">Simulate (Ctrl R) to see the variables.</p>;
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = run.names.filter((n) => n !== "time" && words.every((w) => n.toLowerCase().includes(w)));
  const groups = new Map<string, string[]>();
  for (const n of shown) groups.set(groupOf(n), [...(groups.get(groupOf(n)) ?? []), n]);
  const last = (n: string) => { const v = run.series[n]; return v?.[v.length - 1]; };
  const row = (n: string, nested: boolean) => {
    const i = picks.indexOf(n);
    return (
      <label key={n} className={`var${nested ? " nested" : ""}`} title={n} style={i >= 0 ? ({ "--trace": `var(--series-${(i % 6) + 1})` } as CSSProperties) : undefined}>
        <input type="checkbox" checked={i >= 0} onChange={() => onPicks(i >= 0 ? picks.filter((x) => x !== n) : [...picks, n])} />
        <span className="vn">{nested ? n.slice(groupOf(n).length + 1) || n : n}</span>
        <span className="vv">{fmt(last(n))}</span>
      </label>
    );
  };
  return (
    <div className="vars">
      <label className="well vars-find"><input placeholder={`Filter ${run.names.length - 1} variables`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter variables" /></label>
      <div className="vars-list" role="group" aria-label="Variables">
        {[...groups].map(([g, names]) => !g || names.length === 1 && names[0] === g
          ? names.map((n) => row(n, false))
          : (
            <div key={g} className="vgroup">
              <button type="button" className="vgh" aria-expanded={words.length > 0 || open.has(g)} onClick={() => setOpen((o) => { const x = new Set(o); x.has(g) ? x.delete(g) : x.add(g); return x; })}>
                <Icon className="caret" name={words.length > 0 || open.has(g) ? "chevron-down" : "chevron-right"} size={12} />{g}<small>{names.filter((n) => picks.includes(n)).length || ""}</small><small className="vc">{names.length}</small>
              </button>
              {(words.length > 0 || open.has(g)) && names.map((n) => row(n, true))}
            </div>
          ))}
        {!shown.length && <p className="vars-none">No variable matches.</p>}
      </div>
    </div>
  );
}

type Phase = { state: "idle" } | { state: "running"; since: number; stage: string } | { state: "done"; ms: number } | { state: "failed" } | { state: "cancelled" };

export function Simulate({
  actions,
  model,
  onRunningChange,
  onRun,
  onToast,
}: {
  actions: Actions;
  model: StudioModel;
  /** A run is background work: it toasts its start and its end (the kit's useToasts().show). */
  onToast?: (t: Omit<Toast, "id"> & { id?: number }) => number;
  onRunningChange?: (running: boolean) => void;
  onRun?: (run: Run) => void;
}) {
  const [stop, setStop] = useState("1");
  const [stimuli, setStimuli] = useState<Record<string, Stimulus>>({});
  const [solver, setSolverState] = useState<SolverChoice>(() => loadSolver(model.name));
  useEffect(() => setSolverState(loadSolver(model.name)), [model.name]);
  const setSolver = (v: SolverChoice) => (setSolverState(v), saveSolver(model.name, v));
  const [solverOpen, setSolverOpen] = useState(false);
  // Run ▸ Solver settings… opens it from the menu bar
  useEffect(() => {
    const open = () => setSolverOpen(true);
    window.addEventListener("articula:solver", open);
    return () => window.removeEventListener("articula:solver", open);
  }, []);
  const inputs = model.entries.filter((e) => e.kind === "input").map((e) => e.name);
  const warnings = outputWarnings(model);
  const [run, setRun] = useState<Run | null>(null);
  const [runVersion, setRunVersion] = useState(0);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const ticket = useRef(0);
  const toastId = useRef<number | undefined>(undefined);
  // what is plotted, kept per model
  const key = `articula.plot:${model.name}`;
  const [picks, setPicksState] = useState<string[]>(() => readStored(key, isList) ?? []);
  useEffect(() => setPicksState(readStored(key, isList) ?? []), [key]);
  const setPicks = (p: string[]) => (setPicksState(p), writeStored(key, p));

  useEffect(() => {
    onRunningChange?.(phase.state === "running");
    return () => onRunningChange?.(false);
  }, [phase.state, onRunningChange]);

  useEffect(() => {
    if (phase.state !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [phase.state]);

  const go = async () => {
    const t = Number(stop);
    if (!(t > 0)) return setError("stop time must be above 0");
    const mine = ++ticket.current;
    const since = Date.now();
    setNow(since);
    setPhase({ state: "running", since, stage: "starting" });
    setError("");
    const id = (toastId.current = onToast?.({ title: `Simulating ${model.name}`, detail: `to ${t} s`, state: "working" }));
    const onStage = (stage: string) => mine === ticket.current && setPhase((p) => (p.state === "running" ? { ...p, stage } : p));
    try {
      const result = await actions.simulate(t, Object.fromEntries(Object.entries(stimuli).filter(([n]) => inputs.includes(n))), solver, onStage);
      if (mine !== ticket.current) return;
      setRun(result);
      setRunVersion((v) => v + 1);
      onRun?.(result);
      setPhase({ state: "done", ms: Date.now() - since });
      onToast?.({ id, title: `Simulated ${model.name}`, detail: `${result.names.length - 1} variables in ${Date.now() - since} ms`, state: "done" });
      // a first run plots a few variables, so there is something to look at
      if (!picks.some((n) => result.names.includes(n))) setPicks(defaultPicks(result.names));
    } catch (e) {
      if (mine !== ticket.current) return;
      const why = explainOmcError((e as Error).message);
      setError(why);
      setPhase({ state: "failed" });
      onToast?.({ id, title: `Simulating ${model.name} failed`, detail: why || "the Console has omc's messages", state: "failed" });
    }
  };
  /** Stop omc's compile or the model's executable; the run's reply is then dropped. */
  const cancel = () => {
    ticket.current++;
    setPhase({ state: "cancelled" });
    if (toastId.current !== undefined) onToast?.({ id: toastId.current, title: "Simulation cancelled" });
    void actions.cancelSimulate();
  };
  // Run ▸ Simulate (Ctrl+Enter) and Run ▸ Cancel simulation reach here as events, like the solver's.
  const latest = useRef({ go, cancel, running: false });
  latest.current = { go, cancel, running: phase.state === "running" };
  useEffect(() => {
    const start = () => !latest.current.running && void latest.current.go();
    const stop = () => latest.current.running && latest.current.cancel();
    // Ctrl+C stops a simulation, as in MX, while there is nothing selected to copy.
    const key = (e: KeyboardEvent) => {
      if (!latest.current.running || !e.ctrlKey || e.shiftKey || e.altKey || e.key.toLowerCase() !== "c") return;
      if (window.getSelection()?.toString() || document.querySelector(".react-flow__node.selected")) return;
      e.preventDefault();
      latest.current.cancel();
    };
    window.addEventListener("articula:simulate", start);
    window.addEventListener("articula:cancel", stop);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("articula:simulate", start);
      window.removeEventListener("articula:cancel", stop);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const status =
    phase.state === "running" ? `${phase.stage}… ${((now - phase.since) / 1000).toFixed(1)} s`
    : phase.state === "done" ? `completed in ${phase.ms} ms`
    : phase.state === "failed" ? "error"
    : phase.state === "cancelled" ? "cancelled"
    : "";

  const plotted = run ? picks.filter((n) => run.names.includes(n)) : [];
  return (
    <section className="simulate" aria-label="Simulate">
      <div className="sim-setup" role="toolbar" aria-label="Simulation setup">
        <label className="well sim-stop" title="Stop time"><span>stop</span><input value={stop} inputMode="decimal" aria-label="Stop time" onChange={(e) => setStop(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void go()} /><span>s</span></label>
        <Key size="sm" title="Solver settings" aria-haspopup="dialog" onClick={() => setSolverOpen(true)}>{summary(solver)}</Key>
          {solverOpen && (
            <SolverSettings intro="omc's integrator for this model; kept with the model." solvers={SOLVERS} options={OPTIONS} solver={solver.method}
              values={{ tolerance: solver.tolerance, intervals: solver.intervals, start: solver.start }} defaults={DEFAULTS}
              onSolver={(method) => setSolver({ ...solver, method })} onOption={(k, v) => setSolver({ ...solver, [k]: v })}
              onReset={() => setSolver({ method: "dassl" })} onClose={() => setSolverOpen(false)} />
          )}
        <span className={`sim-status${phase.state === "failed" ? " bad" : ""}`} role="status">{phase.state === "running" && <Spinner size={12} />}{status}</span>
      </div>
      <Stimuli inputs={inputs} value={stimuli} onChange={setStimuli} />
      {warnings.map((w) => <p key={w} className="sim-note" role="status">{w}</p>)}
      {error && <p className="sim-note bad" role="alert">{error}</p>}
      <div className="sim-plot">
        {plotted.length
          ? <Plot2D key={runVersion} series={plotted.map((n) => ({ x: run!.t, y: run!.series[n].map((v) => v ?? Number.NaN), label: n }))} axes={PLOT_AXES} />
          : <p className="vars-none">{run ? "Check a variable below to plot it." : "Plots appear here after a run."}</p>}
      </div>
      <Variables run={run} picks={picks} onPicks={setPicks} />
    </section>
  );
}
