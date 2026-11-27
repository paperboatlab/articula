// Export as ▸ and Import ▸ (the kit's TransferDialog; plans/2026-11-27_10-55_articula_export_import.md, mockup
// agent-docs rebrand/apps/articula/export.html). An export is the server's `transfer` op: it writes into the
// workspace, and `articula export` is the same from a terminal. An import runs here, as edits to the open model
// (one component and its modifiers), so it undoes like any other edit.
import { useEffect, useState } from "react";
import { Dialog, Key, Segmented, SettingRow, SettingsSection, TransferDialog, TransferPreview, pickKind, shellLine, type TransferKind, type TransferMode } from "@paperboatlab/ui";
import { parse as parseToml } from "smol-toml";
import type { OmcClient } from "../omc/omc.ts";
import type { StudioApi, StudioModel } from "../model/types.ts";

export type Run = { t: number[]; series: Record<string, (number | null)[]> };
type TomlValue = unknown;

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])|([A-Z])([A-Z][a-z])/g, (_, a, b, c, d) => (a ? `${a}-${b}` : `${c}-${d}`)).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
const stemOf = (model: string) => model.split(".").pop() ?? model;
const LANG_EXT = { julia: "jl", python: "py", matlab: "m", modelica: "mo" } as const;
type Lang = keyof typeof LANG_EXT;

/** What Articula writes out; `why` says when one can't be chosen. */
export function exportKinds(o: { model?: StudioModel; stationWhy?: string; run: Run | null }): TransferKind[] {
  const none = o.model ? undefined : "open a model first";
  return [
    { id: "station", group: "For Paperboat", name: "Station", types: ["pst"], line: "The model as it is, nonlinear, for Simplicial's flows", why: none ?? o.stationWhy },
    { id: "linear-station", group: "For Paperboat", name: "Linear station", types: ["pst"], line: "ẋ = Ax + Bu about an operating point; no FMU, no omc to run it", why: none },
    { id: "linear", group: "Model files", name: "Linear model", types: ["jl", "py", "m", "mo"], line: "A, B, C, D as code: Julix designs the controller from them", why: none },
    { id: "fmu", group: "Model files", name: "FMU", types: ["fmu"], line: "For any FMI tool, or Julia's FMI.jl", why: none },
    { id: "flat", group: "Model files", name: "Flat model", types: ["mo"], line: "Every equation in one class, the connectors resolved", why: none },
    { id: "equations", group: "Model files", name: "Equations", types: ["xml"], line: "The equation system omc solves, for other tools", why: none },
    { id: "results", group: "Results", name: "Results", types: ["csv"], line: "The last simulation, for a note or a script", why: none ?? (o.run ? undefined : "simulate first") },
  ];
}

/** What Articula reads in, into the open model. */
export function importKinds(model?: StudioModel): TransferKind[] {
  const none = model ? undefined : "open a model first";
  return [
    { id: "parameters", group: "Into the model", name: "Parameters", types: ["toml", "json"], line: "Set a component's or the model's parameters from a file", why: none },
    { id: "table", group: "Into the model", name: "Data table", types: ["csv"], line: "A table block that plays a run back", why: none },
    { id: "linear", group: "Into the model", name: "Linear model", types: ["toml"], line: "A gain or a StateSpace block from K, or A, B, C, D (Julix's design)", why: none },
    { id: "fmu", group: "Into the model", name: "FMU", types: ["fmu"], line: "A block that runs it", why: none ?? "not yet: omc's importFMU (articula#40)" },
  ];
}

type Opts = {
  out: Record<string, string>;
  path: "auto" | "ode" | "fmu"; solver: "cvode" | "euler";
  set: string; at: string; lang: Lang;
  fmi: "2.0" | "3.0"; fmuType: "cs" | "me";
  stage: "flat" | "optimiser" | "backEnd";
  file: Record<string, string>; into: string; name: string; columns: string[]; smooth: "hold" | "linear" | "smooth";
};

/** `alpha0=0, km = 0.04` → {alpha0: "0", km: "0.04"}; a part that isn't name=number is the error. */
export function parseSet(text: string): { set: Record<string, string>; bad?: string } {
  const set: Record<string, string> = {};
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^([A-Za-z_][\w.[\]]*)\s*=\s*([-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)$/.exec(part);
    if (!m) return { set, bad: part };
    set[m[1]] = m[2];
  }
  return { set };
}

/** The defaults: stations in stations/, model files beside the model in out/, results in runs/. */
export function defaultOut(kind: string, model: string, modelDir: string, lang: Lang = "julia"): string {
  const stem = stemOf(model), dir = modelDir ? `${modelDir}/out` : "out";
  const day = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case "station": return `stations/${kebab(stem)}.pst`;
    case "linear-station": return `stations/${kebab(stem)}-linear.pst`;
    case "linear": return `${dir}/${stem}-lin.${LANG_EXT[lang]}`;
    case "fmu": return `${dir}/${model}.fmu`;
    case "flat": return `${dir}/${stem}.flat.mo`;
    case "equations": return `${dir}/${stem}.dae.xml`;
    default: return `runs/${day}_${kebab(stem)}/run.csv`;
  }
}

/** The run as CSV: time, then each series. */
export function runCsv(run: Run): string {
  const names = Object.keys(run.series);
  const cell = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "" : String(v));
  return [["time", ...names].join(","), ...run.t.map((t, i) => [t, ...names.map((n) => cell(run.series[n][i]))].join(","))].join("\n") + "\n";
}

/** Modelica's matrix literal: [1, 2; 3, 4]. */
export function moMatrix(v: TomlValue): string {
  const rows = rowsOf(v);
  return `[${rows.map((r) => r.join(", ")).join("; ")}]`;
}
/** A number, a vector (one row) or a matrix, as rows of numbers. */
export function rowsOf(v: TomlValue): number[][] {
  if (!Array.isArray(v)) return [[Number(v)]];
  return v.length && Array.isArray(v[0]) ? (v as unknown[][]).map((r) => r.map(Number)) : [v.map(Number)];
}

/** The block a linear import makes from the file's matrices: K alone a gain (u = −K x), A, B, C, D a StateSpace. */
export function linearBlock(t: Record<string, TomlValue>): { cls: string; mods: Record<string, string> } | { why: string } {
  if (["A", "B", "C", "D"].every((k) => k in t))
    return { cls: "Modelica.Blocks.Continuous.StateSpace", mods: Object.fromEntries(["A", "B", "C", "D"].map((k) => [k, moMatrix(t[k])])) };
  if ("K" in t) {
    return { cls: "Modelica.Blocks.Math.MatrixGain", mods: { K: moMatrix(rowsOf(t.K).map((r) => r.map((x) => -x))) } };
  }
  return { why: "the file has neither K nor A, B, C and D" };
}

/** `to` from the folder `from` (both absolute, `/`-separated): "../data/x.csv". */
export function relPath(from: string, to: string): string {
  const a = from.split("/").filter(Boolean), b = to.split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}

export function ArticulaTransfer({ mode, kind, omc, api, model, root, hub, exportsTo, pickOut, run, stationWhy, onKind, onDone, onFail, onClose }: {
  mode: TransferMode; kind?: string;
  omc: OmcClient; api: StudioApi | null; model?: StudioModel;
  /** The workspace's root: exports go in it (outside a hub, anywhere), imports read from it. */
  root: string;
  /** In a hub: its exports stay in it. */
  hub: boolean;
  /** An example opened in place (paperboat#75): where its exports go instead (the server's word), as
   *  nothing is written into it; a relative path is relative to this. */
  exportsTo?: string;
  /** Change…: the hub's picker or the system's save dialog; a path relative to the root, or absolute. */
  pickOut?: (name: string, types: string[]) => Promise<string | null>;
  run: Run | null; stationWhy?: string;
  onKind: (mode: TransferMode, kind: string) => void;
  onDone: (title: string, detail: string, mode: TransferMode) => void;
  onFail: (e: Error, mode: TransferMode) => void;
  onClose: () => void;
}) {
  const name = model?.name ?? "";
  const rel = (f: string) => (f.startsWith(root + "/") ? f.slice(root.length + 1) : f);
  const modelDir = model?.file ? rel(model.file).split("/").slice(0, -1).join("/") : "";
  const [o, setO] = useState<Opts>({ out: {}, path: "auto", solver: "cvode", set: "", at: "0", lang: "julia", fmi: "2.0", fmuType: "cs", stage: "backEnd", file: {}, into: "", name: "", columns: [], smooth: "hold" });
  const up = (p: Partial<Opts>) => setO((x) => ({ ...x, ...p }));
  const [busy, setBusy] = useState("");
  // a file there already: ask first (Replace or Cancel), unless a picker just asked about that path
  const [taken, setTaken] = useState<{ kind: string; path: string } | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<string[]>([]);
  const [data, setData] = useState<{ file: string; text?: string; error?: string }>({ file: "" });

  // the workspace's files, for an import to pick from
  useEffect(() => {
    void omc.op<{ path: string; kind: string }[]>("hub_files", { root }).then(   // paths relative to the root
      (t) => setFiles((Array.isArray(t) ? t : []).filter((e) => e.kind === "file").map((e) => e.path)), () => setFiles([]));
  }, [omc, root]); // eslint-disable-line react-hooks/exhaustive-deps
  const fits = (f: string, types: string[]) => types.some((t) => f.endsWith("." + t));
  // the first file that fits; for a linear model, one named like a design first (lqr, lin, gain)
  const pick = (k: string, types: string[]) =>
    o.file[k] ?? (k === "linear" ? files.find((f) => fits(f, types) && /lqr|lin|gain|ctrl|control/i.test(f.split("/").pop()!)) : undefined) ?? files.find((f) => fits(f, types)) ?? "";
  /** `want`, or want2, want3… when the model has a component of that name. */
  const fresh = (want: string) => { let n = want, i = 1; while (model?.components.some((c) => c.name === n)) n = `${want}${++i}`; return n; };
  // read the chosen file once it changes
  // the kind shown now: the dialog keeps it, and says so through onKind
  const [cur, setCur] = useState<{ mode: TransferMode; kind?: string }>(() => ({ mode, kind: pickKind(mode === "export" ? exportKinds({ model, stationWhy, run }) : importKinds(model), kind)?.id }));
  const want = cur.mode === "import" && cur.kind ? pick(cur.kind, importKinds(model).find((x) => x.id === cur.kind)?.types as string[] ?? []) : "";
  useEffect(() => {
    if (!want || want === data.file) return;
    setData({ file: want });
    void omc.op<{ text: string }>("read_data", { file: want, limit: 1 << 16 }).then((r) => setData({ file: want, text: r.text }), (e: Error) => setData({ file: want, error: e.message }));
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps

  const out = (k: string) => o.out[k] ?? defaultOut(k, name, modelDir, o.lang);
  const { set, bad } = parseSet(o.set);
  const args = (k: string): Record<string, unknown> => {
    const base = { kind: k, model: name, source: model?.file, out: out(k) };
    if (k === "station") return { ...base, path: o.path, fmu_solver: o.solver };
    if (k === "linear" || k === "linear-station") return { ...base, set, at: Number(o.at) || 0, lang: o.lang };
    if (k === "fmu") return { ...base, fmi: o.fmi, fmuType: o.fmuType, fmu_solver: o.solver };
    if (k === "equations") return { ...base, stage: o.stage };
    if (k === "results") return { ...base, text: run ? runCsv(run) : "" };
    return base;
  };
  const command = (m: TransferMode, k: string) => {
    if (m !== "export" || k === "results" || !model?.file) return undefined;
    const a = ["articula", "export", rel(model.file), "--model", name, "--as", k];
    if (k === "station" && o.path !== "auto") a.push("--path", o.path);
    if ((k === "linear" || k === "linear-station") && Object.keys(set).length) a.push("--set", Object.entries(set).map(([n, v]) => `${n}=${v}`).join(","));
    if ((k === "linear" || k === "linear-station") && Number(o.at)) a.push("--at", o.at);
    if (k === "linear" && o.lang !== "julia") a.push("--lang", o.lang);
    if (k === "fmu") a.push("--fmi", o.fmi, "--type", o.fmuType);
    if (k === "equations" && o.stage !== "backEnd") a.push("--stage", o.stage);
    return shellLine([...a, "--out", out(k)]);
  };

  /** false: a file is there and the user is asked first; the dialog stays. */
  const exportRun = async (k: string, replace = picked[k] === out(k)) => {
    if (bad) throw new Error(`the operating point takes name = number: ${bad}`);
    const r = await omc.op<{ path: string; notes: string[]; exists?: string }>("transfer", { mode: "export", ...args(k), replace },
      (stage) => setBusy(`${stage[0].toUpperCase()}${stage.slice(1)}…`));
    if (r.exists) return (setTaken({ kind: k, path: r.exists }), false);
    onDone(`Exported ${r.path}`, r.notes.filter(Boolean).join(" · ") || `into ${exportsTo ?? root.split("/").pop()}`, "export");
  };
  const importRun = async (k: string) => {
    if (!api || !model) throw new Error("open a model first");
    const at = { x: -160, y: -160, rotation: 0 as const };
    const file = pick(k, importKinds(model).find((x) => x.id === k)!.types as string[]);
    if (!data.text || data.file !== file) throw new Error(`couldn't read ${file || "the file"}`);
    if (k === "parameters") {
      const rows = paramRows();
      for (const r of rows.filter((r) => r.changes)) await api.setParam(o.into ? `${o.into}.${r.name}` : r.name, r.value);
      onDone(`Set ${rows.filter((r) => r.changes).length} parameters`, `${o.into || name} from ${file}`, "import");
    } else if (k === "table") {
      const head = header(), cols = (o.columns.length ? o.columns : head.slice(1, 2)).map((c) => head.indexOf(c) + 1);
      const n = fresh(o.name || "table");
      await api.addComponent("Modelica.Blocks.Sources.CombiTimeTable", n, at);
      const smooth = { hold: "ConstantSegments", linear: "LinearSegments", smooth: "ContinuousDerivative" }[o.smooth];
      // a modelica:// URI from the model's top class, through loadResource (the table reads only a path): omc finds
      // it in a container or not, and the .mo stays portable
      const top = name.split(".")[0];
      const home = (await omc.call(`uriToFilename("modelica://${top}/")`)).replace(/^"|"$/g, "").replace(/\/+$/, "");
      const uri = `modelica://${top}/${relPath(home, `${root}/${file}`)}`;
      for (const [p, v] of Object.entries({ tableOnFile: "true", tableName: '"NoName"', fileName: `Modelica.Utilities.Files.loadResource(${JSON.stringify(uri)})`, delimiter: '","', nHeaderLines: "1",
        columns: `{${cols.join(", ")}}`, smoothness: `Modelica.Blocks.Types.Smoothness.${smooth}` })) await api.setParam(`${n}.${p}`, v);
      onDone(`Added ${n}`, `a CombiTimeTable playing ${file}`, "import");
    } else if (k === "linear") {
      const b = linearBlock(parseToml(data.text) as Record<string, TomlValue>);
      if ("why" in b) throw new Error(b.why);
      const n = fresh(o.name || stemOf(file.split("/").pop()!.replace(/\.[^.]+$/, "")).replace(/[^A-Za-z0-9_]/g, "_"));
      await api.addComponent(b.cls, n, at);
      for (const [p, v] of Object.entries(b.mods)) await api.setParam(`${n}.${p}`, v);
      onDone(`Added ${n}`, `${b.cls.split(".").pop()} from ${file}`, "import");
    }
  };
  const header = () => (data.text ?? "").split(/\r?\n/)[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const paramRows = () => {
    let table: Record<string, TomlValue> = {};
    try { table = (data.file.endsWith(".json") ? JSON.parse(data.text ?? "{}") : parseToml(data.text ?? "")) as Record<string, TomlValue>; } catch { /* shown as no rows */ }
    const comp = model?.components.find((c) => c.name === o.into);
    const now: Record<string, string> = comp ? { ...comp.defaults, ...comp.params } : Object.fromEntries((model?.params ?? []).map((p) => [p.id, String(p.default ?? "")]));
    return Object.entries(table).filter(([k, v]) => k in now && typeof v === "number").map(([k, v]) => ({ name: k, was: now[k], value: String(v), changes: Number(now[k]) !== v }));
  };

  const place = root.split("/").pop();
  const where = (k: string) => (
    <SettingsSection title="Where">
      <SettingRow label="Save to" hint={exportsTo ? `${place} is an example: nothing is written into it. A path here is in ${exportsTo}, or anywhere else on this computer (an absolute path, ~/…)`
        : hub ? `In the hub ${place}: an export stays in it; a file there already is replaced when you say so, its earlier version in the hub's history`
        : `In ${place}, or anywhere on this computer (an absolute path, ~/…); a file there already is replaced when you say so`}>
        <input className="well transfer-path" aria-label="Save to" value={out(k)} onChange={(e) => up({ out: { ...o.out, [k]: e.target.value } })} />
        {pickOut && <Key size="sm" onClick={() => void pickOut(out(k).split("/").pop()!, exportKinds({ model, run }).find((x) => x.id === k)!.types as string[])
          .then((p) => { if (p) { up({ out: { ...o.out, [k]: p } }); setPicked((x) => ({ ...x, [k]: p })); } })}>Change…</Key>}
      </SettingRow>
    </SettingsSection>
  );
  const opPoint = (
    <SettingsSection title="Operating point">
      <SettingRow label="Parameters" hint={bad ? `name = number: ${bad}` : "Changed for the linearisation only (alpha0 = 0: upright); the inputs at 0"}>
        <input className="well" aria-label="Parameters" placeholder="alpha0 = 0" value={o.set} onChange={(e) => up({ set: e.target.value })} />
      </SettingRow>
      <SettingRow label="At" hint="The time it linearises at: 0 is the start, after the initial equations"><input className="well" aria-label="At" value={o.at} onChange={(e) => up({ at: e.target.value })} style={{ width: 80 }} /><span className="settings-note">s</span></SettingRow>
    </SettingsSection>
  );
  const filePick = (k: string, types: string[]) => (
    <SettingRow label="File" hint={data.error ?? (data.text === undefined && want ? "reading…" : `In the workspace: ${types.map((t) => "." + t).join(" ")}`)}>
      <select className="well" aria-label="File" value={pick(k, types)} onChange={(e) => up({ file: { ...o.file, [k]: e.target.value } })}>
        {files.filter((f) => types.some((t) => f.endsWith("." + t))).map((f) => <option key={f}>{f}</option>)}
      </select>
    </SettingRow>
  );

  const body = (m: TransferMode, k: string) => {
    if (m === "import") {
      if (k === "parameters") {
        const rows = paramRows();
        return (
          <SettingsSection title="Parameters">
            {filePick(k, ["toml", "json"])}
            <SettingRow label="Into" hint="A component's modifiers, or the model's own parameters">
              <select className="well" aria-label="Into" value={o.into} onChange={(e) => up({ into: e.target.value })}>
                <option value="">{name} (the model)</option>
                {model?.components.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </SettingRow>
            <TransferPreview>{rows.length ? rows.map((r) => `${r.name.padEnd(10)}${(r.was || "–").padEnd(14)}→ ${r.value}${r.changes ? "" : "   (the same)"}`).join("\n") : "Nothing in the file matches its parameters"}</TransferPreview>
          </SettingsSection>
        );
      }
      if (k === "table") {
        const head = header();
        return (
          <SettingsSection title="Data table">
            {filePick(k, ["csv"])}
            <SettingRow label="Columns" hint={`Time is the first (${head[0] || "–"}); the block's outputs, in this order`}>
              {head.slice(1).map((c) => <Key key={c} size="sm" aria-pressed={(o.columns.length ? o.columns : head.slice(1, 2)).includes(c)}
                onClick={() => { const now = o.columns.length ? o.columns : head.slice(1, 2); up({ columns: now.includes(c) ? now.filter((x) => x !== c) : [...now, c] }); }}>{c}</Key>)}
            </SettingRow>
            <SettingRow label="Between rows"><Segmented label="Between rows" options={[{ value: "hold", label: "Hold" }, { value: "linear", label: "Linear" }, { value: "smooth", label: "Smooth" }]} value={o.smooth} onChange={(v) => up({ smooth: v })} /></SettingRow>
            <SettingRow label="Name" hint="The component's name in the model; the block reads the file when the model runs"><input className="well" aria-label="Name" placeholder="table" value={o.name} onChange={(e) => up({ name: e.target.value })} /></SettingRow>
          </SettingsSection>
        );
      }
      if (k === "linear") {
        let b: ReturnType<typeof linearBlock> | null = null;
        try { if (data.text) b = linearBlock(parseToml(data.text) as Record<string, TomlValue>); } catch (e) { b = { why: (e as Error).message }; }
        return (
          <SettingsSection title="Linear model">
            {filePick(k, ["toml"])}
            <SettingRow label="Name" hint="The component's name in the model"><input className="well" aria-label="Name" placeholder="from the file's name" value={o.name} onChange={(e) => up({ name: e.target.value })} /></SettingRow>
            <TransferPreview>{!b ? "…" : "why" in b ? b.why : `${b.cls}\n${Object.entries(b.mods).map(([p, v]) => `  ${p} = ${v}`).join("\n")}`}</TransferPreview>
          </SettingsSection>
        );
      }
      return <p className="settings-note">Importing an FMU comes with omc's importFMU (articula#40).</p>;
    }
    const section = (title: string, ...rows: React.ReactNode[]) => <SettingsSection title={title}><SettingRow label="Model"><span className="well">{name}</span></SettingRow>{rows}</SettingsSection>;
    switch (k) {
      case "station": return <>{section("Station",
        <SettingRow key="p" label="Path" hint="Auto: equations when the model has no events, else an FMU"><Segmented label="Path" options={[{ value: "auto", label: "Auto" }, { value: "ode", label: "Equations" }, { value: "fmu", label: "FMU" }]} value={o.path} onChange={(v) => up({ path: v })} /></SettingRow>,
        <SettingRow key="s" label="FMU solver" hint="Inside the FMU, between Simplicial's steps"><Segmented label="FMU solver" options={[{ value: "cvode", label: "CVODE" }, { value: "euler", label: "Euler" }]} value={o.solver} onChange={(v) => up({ solver: v })} /></SettingRow>)}{where(k)}</>;
      case "linear-station": return <>{section("Linear station")}{opPoint}<SettingsSection title="The station"><TransferPreview>{`One block, ${stemOf(name)}Linear:\n  ẋ = A x + B u,  y = C x + D u\nIts inputs and outputs are the model's, each counted\nfrom its value at the operating point; x starts at 0.\nThe equations path: no FMU, no omc to run it.`}</TransferPreview></SettingsSection>{where(k)}</>;
      case "linear": return <>{section("Linear model",
        <SettingRow key="l" label="Language" hint="Julia: a function returning A, B, C, D and the names; Modelica: a model"><Segmented label="Language" options={[{ value: "julia", label: "Julia" }, { value: "python", label: "Python" }, { value: "matlab", label: "MATLAB" }, { value: "modelica", label: "Modelica" }]} value={o.lang} onChange={(v) => up({ lang: v, out: { ...o.out, linear: undefined as unknown as string } })} /></SettingRow>)}{opPoint}{where(k)}</>;
      case "fmu": return <>{section("FMU",
        <SettingRow key="f" label="FMI"><Segmented label="FMI" options={[{ value: "2.0", label: "2.0" }, { value: "3.0", label: "3.0" }]} value={o.fmi} onChange={(v) => up({ fmi: v })} /></SettingRow>,
        <SettingRow key="t" label="Kind" hint="Co-simulation carries its own solver; model exchange gives the tool the equations"><Segmented label="Kind" options={[{ value: "cs", label: "Co-simulation" }, { value: "me", label: "Model exchange" }]} value={o.fmuType} onChange={(v) => up({ fmuType: v })} /></SettingRow>,
        <SettingRow key="s" label="Solver" hint="Co-simulation only"><Segmented label="Solver" options={[{ value: "cvode", label: "CVODE" }, { value: "euler", label: "Euler" }]} value={o.solver} onChange={(v) => up({ solver: v })} /></SettingRow>)}
        <SettingsSection title="In Julia"><TransferPreview>{`using FMI\nfmu = loadFMU("${out(k)}")   # FMI.jl, from Julix's Packages`}</TransferPreview></SettingsSection>{where(k)}</>;
      case "flat": return <>{section("Flat model")}{where(k)}</>;
      case "equations": return <>{section("Equations",
        <SettingRow key="s" label="Stage" hint="Back end: after index reduction and tearing, with how each equation is solved"><Segmented label="Stage" options={[{ value: "flat", label: "Flat" }, { value: "optimiser", label: "Optimised" }, { value: "backEnd", label: "Back end" }]} value={o.stage} onChange={(v) => up({ stage: v })} /></SettingRow>)}{where(k)}</>;
      default: return <>
        <SettingsSection title="Results"><TransferPreview>{run ? `time, ${Object.keys(run.series).join(", ")}\n${run.t.length} rows, ${run.t[0]} to ${run.t[run.t.length - 1]} s` : "Simulate first"}</TransferPreview></SettingsSection>{where(k)}</>;
    }
  };

  const SAY: Record<string, string> = { station: "Builds the station (a minute the first time), then packs it", "linear-station": "Linearises, then builds a station from A, B, C, D", linear: "omc's linearize", fmu: "omc's buildModelFMU", flat: "omc's instantiateModel", equations: "omc's dumpXMLDAE", results: "From the last run; nothing runs again" };
  const go = (m: TransferMode, k: string, replace?: boolean) => {
    setBusy(m === "export" ? "Exporting…" : "Importing…");
    (m === "export" ? exportRun(k, replace) : importRun(k)).then((done) => done !== false && onClose(), (e: Error) => onFail(e, m)).finally(() => setBusy(""));
  };
  return (<>
    <TransferDialog kinds={{ export: exportKinds({ model, stationWhy, run }), import: importKinds(model) }} mode={mode} kind={kind}
      subject={model?.file ? `${name} · ${rel(model.file)}` : name}
      body={body} command={command} busy={busy || undefined}
      say={(m, k) => (m === "export" ? SAY[k] : k === "parameters" ? "Changes the modifiers: one undo step each" : "Adds a component to the model: Undo takes it back")}
      onKind={(m, k) => { setCur({ mode: m, kind: k }); onKind(m, k); }}
      onRun={(m, k) => go(m, k)}
      onClose={onClose} />
    {taken && (
      <Dialog title={`Replace ${taken.path.split("/").pop()}?`} onClose={() => setTaken(null)} actions={<>
        <Key kind="danger" onClick={() => { const t = taken; setTaken(null); go("export", t.kind, true); }}>Replace</Key>
        <Key shortcut="Esc" onClick={() => setTaken(null)}>Cancel</Key>
      </>}>
        <p>{taken.path} is there already. Replacing it writes over it{hub ? "; its earlier version stays in the hub's history" : ""}.</p>
      </Dialog>
    )}
  </>);
}
