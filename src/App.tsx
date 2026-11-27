// Articula: an OpenModelica editor (agent-docs/rebrand; the window of Julix and Malachite): the bar (mark,
// menus, the workspace well, Check and Simulate, the runtimes key, the Panels key, the window keys); Files and Library at the left; the model's views in the middle (diagram, icon, 3D, text) over the
// Console; the source and Simulate at the right. Without a workspace, the Start page in the bay (the one
// file workflow: plans/2026-11-26_11-05_one_file_workflow.md). Provides StudioContext; the popover opens on
// a component click, the interface sheet on Alt V, the export dock under the stage.

import { ReactFlowProvider } from "@xyflow/react";
import { About, AppMark, Icon, Key, MenuBar, Notifications, Panel, PanelsKey, RuntimesKey, Search, Segmented, ScaleSetting, SettingRow, Settings, SettingsSection, ShortcutList, Split as Gutter, ThemeSetting, Toasts, WindowKeys, isScale, readStored, useScale, useToasts, writeStored, type PaneRect, type Scale, type SearchItem, type Theme } from "@paperboatlab/ui";
import { HelpWindow } from "@paperboatlab/ui";
import { afterClose, EditorSettingsPane, EditorTabs, orderTabs, tabMenu } from "@paperboatlab/ui/editor";
import { helpCommand, SEARCH_CHORD, useShortcuts, type Command } from "@paperboatlab/ui";
import { omHelp } from "./shell/help.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ConnectHub, OpenFile, SaveFile, type Hub } from "@paperboatlab/ui/hub";
import { AskOpen, baseName, fileMenu, parseRecent, parseSettings, recentFor, recentMenu, shell, Start, TypedPath, Unsaved, useOpening, when, WorkspaceWell, type Opening as OpeningState, type RecentEntry, type Workspace as Place } from "@paperboatlab/ui/workspace";
import type { FileEntry } from "@paperboatlab/ui/files";
import { useAppConfig as useSqueroConfig, type ConfigStore } from "@paperboatlab/ui/editor";
import { Canvas } from "./canvas/Canvas.tsx";
import { runStationExport } from "./dock/dock.ts";
import { StudioDock } from "./dock/index.tsx";
import { Library, useClassIndex } from "./library/Library.tsx";
import { PackageWindow } from "@paperboatlab/ui/packages";
import { Packages } from "./library/Packages.tsx";
import { StudioContext, type StudioModel } from "./model/types.ts";
import { OmcClient, type OmcStatus } from "./omc/omc.ts";
import { type Credit, type Log, type Message } from "@paperboatlab/ui";
import { ComponentPopover } from "./popover/index.tsx";
import { InterfaceSheet } from "./sheet/index.tsx";
import { IconView } from "./icon/IconView.tsx";
import { ConfirmModal, LibraryModal, PromptModal } from "./shell/Dialogs.tsx";
import { MENUS } from "./shell/menus.ts";
import { STUDIO_VERSION } from "./version.ts";
import { THEMES, useTheme } from "@paperboatlab/ui";
import { Opening } from "./shell/Opening.tsx";
import { Simulate } from "./simulate/Simulate.tsx";
import { Viewport3D, type ShapeRun } from "./viewport3d/Viewport3D.tsx";
import { Split, type View } from "./split/Split.tsx";
import { StudioConsole, type ConsoleTab } from "./shell/StudioConsole.tsx";
import { Rail, type RailTab } from "./shell/Rail.tsx";
import { TextStage, type TextEditorHandle } from "./shell/TextStage.tsx";
import { NewClassSheet } from "./shell/NewClassSheet.tsx";
import type { NewClassSpec } from "./shell/newClass.ts";
import { closeDoc, inside, neighbour, openDoc, type Doc, type GitState, type Workspace, type WorkspaceEntry } from "./shell/workspace.ts";
import { packageName } from "./shell/newClass.ts";
import { freeSpot } from "./store/plans.ts";
import { useStudioStore } from "./store/index.tsx";

type Focus = "code" | "split" | "scopes";
type Stage = "diagram" | "icon" | "3d" | "text";

function serverUrl(): string {
  const given = new URLSearchParams(location.search).get("server");
  if (given) return given;
  return !location.host ? "ws://localhost:30472" : `ws://${location.host}`;
}

type Side = "l" | "r" | "b";
const PANELS: { side: Side; name: string; keys: string }[] = [
  { side: "l", name: "Files and library", keys: "Ctrl B" }, { side: "b", name: "Console", keys: "Ctrl J" }, { side: "r", name: "Source and Simulate", keys: "Ctrl Alt B" },
];
/** The window as the Panels key sketches it: files, the model, the console, source and simulate. */
const LAYOUT: Record<string, PaneRect> = { l: [4, 4, 12, 36], m: [18, 4, 26, 26], b: [18, 32, 26, 8], r: [46, 4, 14, 36] };
const isHidden = (v: unknown): v is Record<Side, boolean> => !!v && typeof v === "object" && PANELS.every((p) => typeof (v as Record<string, unknown>)[p.side] === "boolean");


export function App() {
  const [status, setStatus] = useState<OmcStatus>({ state: "checking", version: "" });
  const [omc, setOmc] = useState<OmcClient | null>(null);
  useEffect(() => {
    const client = new OmcClient(serverUrl(), setStatus);
    setOmc(client);
    return () => client.close();
  }, []);
  return omc ? (
    <ReactFlowProvider>
      <Studio omc={omc} status={status} />
    </ReactFlowProvider>
  ) : null;
}

type PromptSpec = {
  title: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (val: string) => void | Promise<void>;
};

/** A hub as the server lists it (`paperboat hub list --json`): the kit's Hub and its folder on this computer. */
type AppHub = Hub & { root: string };

type ConfirmSpec = {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};

// About's "Built on": Articula's own; the kit's (React, @xyflow/react, CodeMirror, uPlot, ...) follow.
const CREDITS: Credit[] = [
  ["OpenModelica (omc)", "compiles and simulates models", "OSMC-PL / GPL-3.0", "https://openmodelica.org"],
  ["Modelica Standard Library", "component models", "BSD-3-Clause", "https://github.com/modelica/ModelicaStandardLibrary"],
  ["three.js", "the 3D view", "MIT", "https://threejs.org"],
];

function Studio({ omc, status }: { omc: OmcClient; status: OmcStatus }) {
  // The user's squero.toml (editor settings and themes, shared with MX), through the server's config ops.
  const config = useMemo<ConfigStore>(() => ({
    read: () => omc.op<{ path: string; text: string | null }>("config"),
    write: (text) => omc.op("config_write", { text }).then(() => undefined),
  }), [omc]);
  const { api, actions, error, stage } = useStudioStore(omc, status);
  const [popover, setPopover] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  // which cards are hidden (the Panels key, Ctrl B / Ctrl J / Ctrl Alt B), kept between visits
  const [hidden, setHidden] = useState<Record<Side, boolean>>(() => readStored("articula.panels", isHidden) ?? { l: false, r: false, b: true });
  useEffect(() => writeStored("articula.panels", hidden), [hidden]);
  // The right card's width, dragged on the gutter beside it (double-click: back to 420).
  const [simWidth, setSimWidth] = useState(() => readStored("articula.simWidth", (v): v is number => typeof v === "number") ?? 420);
  useEffect(() => writeStored("articula.simWidth", simWidth), [simWidth]);
  const toggle = (side: Side, h?: boolean) => setHidden((now) => ({ ...now, [side]: h ?? !now[side] }));
  const side = !hidden.r;
  const setSide = (f: (shown: boolean) => boolean) => toggle("r", !f(side));
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<View>("flat");
  const [focus, setFocus] = useState<Focus>("split");
  // the stage's view of the model (#62): the diagram, the last MultiBody run in 3D, or the .mo
  const [stageView, setStageView] = useState<Stage>("diagram");
  // the workspace and its open documents (#43): the rail lists the folder, the tabs switch files
  const [docs, setDocs] = useState<Doc[]>([]);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  // The rail opens on the files of the Studio's folder, as MX does; the library is a click away.
  const [rail, setRail] = useState<RailTab>("files");
  const railHidden = hidden.l;
  const [newClassOpen, setNewClassOpen] = useState(false);
  const [newClassWithin, setNewClassWithin] = useState<string | undefined>(undefined);
  const [workspaceTick, setWorkspaceTick] = useState(0);
  // Documents and their folder listings read once: switching back is a state restore, not omc again.
  const modelCache = useRef(new Map<string, StudioModel>());
  const [shapeRun, setShapeRun] = useState<ShapeRun | null>(null);
  // The editor settings, from the user's articula.toml; the theme is every app's, in $PAPERBOAT_HOME/settings.json
  // (read again when the window comes back: another app may have changed it), cached here against a flash.
  const settings = useSqueroConfig(config, { editor: "articula.editor", theme: "paperboat.theme" });
  const [theme, setThemeNow] = useState<Theme>(() => parseSettings({ theme: readStored("articula.theme", (v): v is string => typeof v === "string") }).theme);
  const setTheme = useCallback((t: Theme) => {
    setThemeNow(t);
    writeStored("articula.theme", t);
    void omc.op("settings_write", { theme: t }).catch(() => undefined);
  }, [omc]);
  const [scale, setScaleNow] = useState<Scale>(() => readStored("articula.scale", isScale) ?? 1);
  const setScale = useCallback((s: Scale) => {
    setScaleNow(s);
    writeStored("articula.scale", s);
    void omc.op("settings_write", { scale: s }).catch(() => undefined);
  }, [omc]);
  useScale(scale);
  useEffect(() => {
    const read = () => void omc.op("settings").then((v) => {
      const { theme: t, scale: s } = parseSettings(v);
      setThemeNow(t); writeStored("articula.theme", t);
      setScaleNow(s); writeStored("articula.scale", s);
    }, () => undefined);
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [omc]);
  const shown = useTheme(theme);
  const [promptModal, setPromptModal] = useState<PromptSpec | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmSpec | null>(null);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<string | null>(null); // the page Settings is open on
  // About's Paperboat: undefined while the server is asked, null when it isn't installed.
  const [paperboat, setPaperboat] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!aboutOpen) return;
    let live = true;
    omc.op<{ paperboat?: string | null }>("about").then((r) => live && setPaperboat(r.paperboat ?? null), () => live && setPaperboat(null));
    return () => { live = false; };
  }, [omc, aboutOpen]);
  const [helpQuery, setHelpQuery] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false); // the command search (Ctrl K)
  const [logs, setLogs] = useState<Log[]>([]);
  const consoleShown = !hidden.b;
  const setConsoleShown = (shown: boolean) => toggle("b", !shown);
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("console");
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [checking, setChecking] = useState(false);
  const [sourceLine, setSourceLine] = useState(0);
  const [textDirty, setTextDirty] = useState(false);
  const editorHandle = useRef<TextEditorHandle | null>(null);
  const say = (text: string, level: Log["level"] = "info") => setLogs((l) => [...l, { level, text }]);
  // omc's own messages stream into the Console while it works; the server pushes them.
  useEffect(() => {
    omc.onLog((message) => {
      const at = message.file ? ` (${message.file}${message.line ? `:${message.line}` : ""})` : "";
      setLogs((l) => [...l, { level: message.level === "warning" ? "warn" : message.level, text: `${message.text}${at}` }]);
    });
  }, [omc]);
  // Toasts (kit §10): background work and its end; the Console keeps the log lines. A failure also
  // toasts, as the Console is often hidden.
  const notes = useToasts();
  const { show } = notes;
  const fail = (e: Error, title = "Couldn't do that") => {
    say(e.message, "error");
    show({ title, detail: e.message, state: "failed" });
  };
  // omc's session: a loss after it was up stays until dismissed; its return turns the same toast done.
  const session = useRef<{ up: boolean; id?: number }>({ up: false });
  useEffect(() => {
    const s = session.current;
    if (status.state === "ready" && s.id !== undefined) {
      show({ id: s.id, title: "OpenModelica is back", detail: "a new omc session", state: "done" });
      s.id = undefined;
    } else if (status.state === "failed" && s.up && s.id === undefined) {
      s.id = show({ title: "OpenModelica stopped", detail: "The next call starts a new session; the Console has omc's last messages.", state: "failed" });
    }
    if (status.state === "ready") s.up = true;
  }, [status.state, show]);
  // The hubs (paperboat#16), read on start and whenever they are offered; null without Malachite (no
  // Malachite, no hub words).
  const [hubs, setHubs] = useState<AppHub[] | null>(null);
  const opener = useOpening();   // a folder or hub on its way: Start, the well and Connect to a hub say so
  const malachite = hubs !== null;
  const readHubs = useCallback(() => omc.op<AppHub[] | null>("hubs").then((h) => setHubs(Array.isArray(h) ? h : null), () => setHubs(null)), [omc]);
  useEffect(() => void readHubs(), [readHubs]);
  const classes = useClassIndex(omc);

  const model = api?.model;
  const modelFile = model?.file ?? "";

  // ── The workspace (the one file workflow): a folder, a hub, or none (the Start page); the server
  // switches it, and keeps the recent list every app shares. undefined: not read yet.
  const [place, setPlace] = useState<Place | null | undefined>(undefined);
  const [booted, setBooted] = useState(false);  // the splash finished its unfold and handed over
  const placeRoot = useRef<string | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [home, setHome] = useState<string>();
  const readRecent = useCallback(() => omc.op<{ home?: string }>("recent").then((r) => { setRecent(parseRecent(r).recent); setHome(r.home); }, () => undefined), [omc]);
  const hub = place?.kind === "hub" ? hubs?.find((h) => h.id === place.hub) : undefined;
  // the dialogs of the workflow: Open asks, Connect, our picker over the hub, a typed path in a browser
  const [ask, setAsk] = useState<"open" | "connect" | "pickOpen" | "pickSave" | "folder" | "file" | null>(null);
  const [unsaved, setUnsaved] = useState<{ closing?: string; then: (autosave: boolean) => Promise<void> | void } | null>(null);
  const currentEntry = workspace?.entries.find((entry) => entry.path === model?.file);
  const canExport = currentEntry ? currentEntry.classKind === "model" || currentEntry.classKind === "block" : false;
  const classKind = currentEntry?.classKind;
  // A station needs an interface: an input/output pin or a public parameter becomes the block's
  // port / Station property. Without one the export makes nothing Paperboat can connect.
  const publicParams = model?.params.filter((p) => !p.private).length ?? 0;
  const hasInterface = (model?.entries.length ?? 0) > 0 || publicParams > 0;
  const exportReady = canExport && hasInterface;
  const exportWhy = !canExport ? "only a model or a block can be exported to Paperboat" : !hasInterface ? "add a public parameter or an input/output first" : "";
  // A class only offers the views it can use: no diagram for a connector/record/function, no icon for a
  // record/function, no 3D unless the model has MultiBody parts or a run.
  const hasMultiBody = Boolean(shapeRun?.shapes?.length) || Boolean(model?.components.some((c) => /MultiBody/i.test(c.class)));
  const stageOptions = useMemo(() => {
    const kind = classKind ?? "model";
    const out: { value: Stage; label: string; hint: string }[] = [];
    if (kind === "model" || kind === "block") out.push({ value: "diagram", label: "Diagram", hint: "The model's parts and wires" });
    if (kind === "model" || kind === "block" || kind === "connector") out.push({ value: "icon", label: "Icon", hint: "Draw the icon and place connectors" });
    if ((kind === "model" || kind === "block") && hasMultiBody) out.push({ value: "3d", label: "3D", hint: "The last MultiBody run in 3D" });
    out.push({ value: "text", label: "Text", hint: "The model's .mo" });
    return out;
  }, [classKind, hasMultiBody]);

  useEffect(() => {
    if (!stageOptions.some((o) => o.value === stageView)) setStageView(stageOptions[0]?.value ?? "text");
  }, [stageOptions, stageView]);
  useEffect(() => {
    if (popover && model && !model.components.some((c) => c.name === popover)) setPopover(null);
  }, [popover, model]);

  // A new document starts with no messages and no highlighted line.
  useEffect(() => {
    setMessages([]);
    setSelectedMessage(null);
    setSourceLine(0);
  }, [model?.name]);

  // Every open model joins the tab strip; the model the server opened first is the first tab.
  useEffect(() => {
    const file = model?.file;
    if (!file) return;
    setDocs((list) => openDoc(list, { file, name: model.name }));
    modelCache.current.set(file, model);
  }, [model, model?.file, model?.name]);

  // The workspace's tree, for the Files rail. A read is never fatal: the rail is empty when the server
  // can't list the folder.
  useEffect(() => {
    const root = place?.root;
    if (!root) {
      setWorkspace(null);
      return;
    }
    let live = true;
    omc.op<Workspace>("tree").then((next) => live && setWorkspace(next), () => live && setWorkspace(null));
    return () => {
      live = false;
    };
  }, [omc, place?.root, workspaceTick]);

  // Git, for the Text view's gutter and the rail's M/U: read again when the folder or what is saved
  // changes, and when the window regains focus (a commit in a terminal, say).
  const [git, setGit] = useState<GitState | null>(null);
  const [gitTick, setGitTick] = useState(0);
  useEffect(() => {
    const bump = () => setGitTick((n) => n + 1);
    window.addEventListener("focus", bump);
    return () => window.removeEventListener("focus", bump);
  }, []);
  const gitRoot = place?.kind === "folder" ? place.root : undefined;  // inside a hub no app shows Git
  const savedState = `${actions.dirty}|${textDirty}`;
  const workingFile = model?.file ? model.file.slice(model.file.lastIndexOf("/") + 1) : model?.name;
  const fileDirty = actions.dirty || textDirty;
  useEffect(() => {
    document.title = workingFile ? `${fileDirty ? "● " : ""}${workingFile} · Articula` : "Articula";
  }, [workingFile, fileDirty]);
  useEffect(() => {
    if (!gitRoot) { setGit(null); return; }
    let live = true;
    omc.op<GitState | null>("git", { root: gitRoot }).then((next) => live && setGit(next || null), () => live && setGit(null));
    return () => { live = false; };
  }, [omc, gitRoot, workspaceTick, gitTick, savedState]);

  /** A create/delete/duplicate changed the folder: read its tree again. */
  const refreshWorkspace = () => setWorkspaceTick((t) => t + 1);

  useEffect(() => {
    if (actions.notice.text) say(actions.notice.text, actions.notice.failed ? "error" : "info");
  }, [actions.notice]);

  const saveCurrent = async () => {
    const editor = editorHandle.current;
    if (editor?.dirty) return editor.save();
    return actions.save();
  };

  /** What the workspace is now (the server's word): the tabs and models outside it go. */
  const applyPlace = (next: Place | null) => {
    const root = next?.root ?? null;
    setPlace(next);
    void readRecent();
    if (root === placeRoot.current) return;
    placeRoot.current = root;
    const keep = (f: string) => root !== null && inside(f, root);
    setDocs((list) => list.filter((d) => keep(d.file)));
    setPinned((now) => new Set([...now].filter(keep)));
    for (const f of [...modelCache.current.keys()]) if (!keep(f)) modelCache.current.delete(f);
    if (next?.kind === "hub") void readHubs();
  };
  const readPlace = () => omc.op<Place | { kind: null }>("workspace").then((w) => applyPlace(w.kind ? w as Place : null));
  useEffect(() => void readPlace().catch((e: Error) => fail(e, "Couldn't read the workspace")), [omc]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Switch documents: save the current one first (unless it is being let go), so a tab is never a stale
   *  buffer. A file from outside the workspace switches it: the server says where to. */
  const openDocument = async (file: string, content?: string, autosave = true) => {
    if (file === model?.file) return;
    try {
      const editor = editorHandle.current;
      if (autosave && editor?.dirty) await editor.save();
      else if (autosave && actions.dirty) await actions.save();
      const cached = content === undefined ? modelCache.current.get(file) : undefined;
      if (cached) actions.restore(cached);
      else {
        await actions.openFile(file, content);
        await readPlace();
      }
    } catch (err) {
      fail(err as Error, "Couldn't open the model");
    }
  };

  /** Close tabs (the kit's rules: the right neighbour shows, else the left; none left: no model). The
   *  shown one is saved by openDocument before it goes, unless `autosave` is off (Don't save). */
  const closeDocuments = async (paths: string[], autosave = true) => {
    const current = model?.file ?? null;
    const after = afterClose(orderTabs(docs.map((d) => d.file), pinned), current, paths);
    setDocs((list) => list.filter((d) => !paths.includes(d.file)));
    setPinned((now) => new Set([...now].filter((f) => !paths.includes(f))));
    for (const f of paths) if (!autosave) modelCache.current.delete(f);
    if (after.current && after.current !== current) await openDocument(after.current, undefined, autosave);
    else if (!after.current) actions.close();
  };

  /** Unsaved changes ask first (Save, Don't save, Cancel) before `then` lets the shown model go. */
  const guard = (closing: string | undefined, then: (autosave: boolean) => Promise<void> | void) =>
    model && fileDirty ? setUnsaved({ closing, then }) : void then(true);
  const closing = place?.kind === "hub" ? "the hub" : "the folder";
  /** Open folder, Connect, Close: the server switches; the model in the old workspace goes (asked first). */
  // `what`: the folder or hub on its way: Start, the well and Connect to a hub say so until it is open
  const switchPlace = (what: Omit<OpeningState, "error" | "detail"> | null, go: () => Promise<Place | { kind: null }>) => guard(closing, async () => {
    const work = async () => {
      const w = await go();
      const next = w.kind ? w as Place : null;
      applyPlace(next);
      if (model?.file && !(next && inside(model.file, next.root))) actions.close();
    };
    try {
      await (what ? opener.open(what, work) : work());
    } catch (e) {
      fail(e as Error, "Couldn't open it");
      void readRecent();
    }
  });
  const openFolder = (path: string) => switchPlace({ name: baseName(path), path }, () => omc.op("open_folder", { path }));
  const connect = (id: string) => switchPlace({ name: hubs?.find((h) => h.id === id)?.name ?? "the hub", hub: id }, () => omc.op("connect", { hub: id }));
  const closePlace = () => switchPlace(null, () => omc.op("close_workspace"));
  const pickFolder = () => {
    const sh = shell();
    if (!sh) return setAsk("folder");
    void sh.pickFolder("Open folder").then((p) => p && openFolder(p));
  };
  /** A local .mo: the system's dialog in a Paperboat window, a typed path in a browser. */
  const pickLocal = () => {
    const sh = shell();
    if (!sh) return setAsk("file");
    void sh.pickFile(["mo"], "Open a model").then((p) => p && void openDocument(p));
  };
  /** File › Open file…: our picker in a hub; outside one, ask (a local file or a hub) when Malachite is here. */
  const openFile = () => (place?.kind === "hub" ? setAsk("pickOpen") : malachite ? (setAsk("open"), void readHubs()) : pickLocal());
  const openConnect = () => (setAsk("connect"), void readHubs());
  /** Save as: our picker in a hub; the system's dialog in a Paperboat window; a download in a browser. Then
   *  the new file is the one open (its workspace, when it lies outside). */
  const saveAsTo = async (path: string) => {
    const old = model?.file;
    try {
      await actions.saveAs(path);
      if (old && old !== path) {
        modelCache.current.delete(old);
        setDocs((list) => list.filter((d) => d.file !== old));
      }
      await actions.openFile(path);
      await readPlace();
    } catch (e) {
      fail(e as Error, "Couldn't save");
    }
  };
  const saveAs = () => {
    if (!model) return;
    const name = model.file ? baseName(model.file) : `${model.name}.mo`;
    if (place?.kind === "hub") return setAsk("pickSave");
    const sh = shell();
    if (sh) return void sh.pickSave(name, ["mo"], "Save the model as").then((p) => { if (p) void saveAsTo(p); });
    void actions.source().then((text) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    }, (e: Error) => fail(e, "Couldn't save"));
  };
  const newHub = () =>
    setPromptModal({
      title: "New hub",
      label: "Name",
      placeholder: "e.g. tank-lab",
      confirmLabel: "Make",
      onConfirm: (name) => omc.op<AppHub[] | null>("hub_new", { name }).then((list) => {
        setHubs(Array.isArray(list) ? list : null);
        const made = Array.isArray(list) ? list.find((h) => h.name === name) : undefined;
        if (made) connect(made.id);
      }, (e) => fail(e, "Couldn't make the hub")),
    });
  const openInMalachite = () => place && void omc.op("hub_open_malachite", { root: place.root }).catch((e) => fail(e, "Couldn't open Malachite"));
  /** A recent entry: a folder opens, a hub connects, a file opens (in its folder or hub). A folder that is
   *  gone leaves the list. */
  const openRecent = (e: RecentEntry) => {
    if (e.kind === "file") return void openDocument(e.path);
    const go = e.kind === "hub" && e.hub ? () => omc.op<Place>("connect", { hub: e.hub }) : () => omc.op<Place>("open_folder", { path: e.path });
    switchPlace(e.kind === "hub" && e.hub ? { name: baseName(e.path), hub: e.hub } : { name: baseName(e.path), path: e.path }, () => go().catch(async (err: Error) => {
      if (!/^no hub/.test(err.message)) await omc.op("recent_forget", { kind: e.kind, path: e.path }).catch(() => undefined);
      throw err;
    }));
  };
  const clearRecent = () => void omc.op("recent_forget").then(() => setRecent([]), (e: Error) => fail(e));
  const recentItems = recentMenu(recentFor({ version: 1, recent }, "articula", { hubs: malachite }), openRecent, clearRecent);
  /** Our picker's preview of a hub file: when it changed, its size (the server's `at`, `size`). */
  const describeFile = (e: FileEntry) => {
    const { at, size } = e as FileEntry & { at?: number; size?: number };
    return <dl className="open-facts">
      {at !== undefined && <><dt>changed</dt><dd>{when(at, Date.now() / 1000)}</dd></>}
      {size !== undefined && <><dt>size</dt><dd>{size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`}</dd></>}
    </dl>;
  };
  /** A .mo dropped on the Start page: its text lands in Articula's own folder (a page gets no real path). */
  const onDrop = (e: DragEvent) => {
    const f = [...e.dataTransfer.files].find((one) => one.name.endsWith(".mo"));
    if (!f) return void show({ title: "Drop a .mo file", detail: "a folder opens with Open folder… (Ctrl Shift O)", state: "failed" });
    void f.text().then((text) => openDocument(f.name, text));
  };
  const shownDocs = orderTabs(docs.map((d) => d.file), pinned).map((f) => docs.find((d) => d.file === f)!);
  const docMenu = (file: string) => tabMenu(file, { tabs: shownDocs.map((d) => d.file), pinned, dirty: (f) => f === model?.file && (actions.dirty || textDirty) }, {
    close: (paths) => void closeDocuments(paths),
    pin: (f, on) => setPinned((now) => { const next = new Set(now); if (on) next.add(f); else next.delete(f); return next; }),
    reveal: () => (setRail("files"), toggle("l", false)),
  }).map((item) => (shownDocs.length < 2 && typeof item === "object" && "run" in item && /^tab-(this|others|right|saved|all)$/.test(item.id)
    ? { ...item, disabled: true, why: "The last model stays open" } : item));

  /** Write the class, then open it as a document; the Files rail picks it up from the new model. */
  const createNewClass = async (spec: NewClassSpec) => {
    if (editorHandle.current?.dirty) await editorHandle.current.save();
    else if (actions.dirty) await actions.save();
    const made = await actions.createClass(spec);
    await actions.openFile(made.file);
    setNewClassOpen(false);
    refreshWorkspace();
    say(`Created ${made.model}`);
  };

  /** The qualified package of an entry (a package itself, or a class's parent), or "". */
  const withinOf = (entry?: WorkspaceEntry): string => {
    if (!workspace || !entry) return "";
    const dir = entry.kind === "package" ? entry.path : entry.path.slice(0, entry.path.lastIndexOf("/"));
    return packageName(workspace.root, dir);
  };
  const parentOf = (entry?: WorkspaceEntry): string | undefined => {
    if (!workspace) return undefined;
    if (!entry) return workspace.root;
    return entry.kind === "package" ? entry.path : entry.path.slice(0, entry.path.lastIndexOf("/"));
  };

  const openNewClass = (entry?: WorkspaceEntry) => {
    setNewClassWithin(entry ? withinOf(entry) : undefined);
    setNewClassOpen(true);
  };

  const newPackage = (entry?: WorkspaceEntry) => {
    const parent = parentOf(entry);
    if (!parent) return;
    setPromptModal({
      title: "New Package",
      label: "Package name",
      value: "NewPackage",
      confirmLabel: "Create",
      onConfirm: async (name) => {
        try {
          await actions.newPackage(parent, name, withinOf(entry));
          refreshWorkspace();
          say(`Created package ${name}`);
        } catch (err) {
          fail(err as Error);
        }
      },
    });
  };

  const moveEntry = async (source: WorkspaceEntry, target?: WorkspaceEntry) => {
    if (source.kind !== "class") return;
    const targetDir = parentOf(target);
    if (!targetDir) return;
    const within = target ? withinOf(target) : "";
    try {
      const made = await actions.moveClass({ file: source.path, targetDir, within });
      modelCache.current.delete(source.path);
      modelCache.current.delete(made.file);
      setDocs((list) => list.map((doc) => (doc.file === source.path ? { file: made.file, name: made.model } : doc)));
      await openDocument(made.file);
      refreshWorkspace();
      say(`Moved ${source.name} to ${within || "the workspace root"}`);
    } catch (err) {
      fail(err as Error);
    }
  };

  const duplicate = (entry: WorkspaceEntry) => {
    if (entry.kind !== "class") return;
    setPromptModal({
      title: `Duplicate ${entry.name}`,
      label: "New class name",
      value: `${entry.name}Copy`,
      confirmLabel: "Duplicate",
      onConfirm: async (name) => {
        try {
          const made = await actions.duplicateClass({ file: entry.path, name: entry.name, newName: name, within: withinOf(entry) });
          modelCache.current.delete(made.file);
          await openDocument(made.file);
          refreshWorkspace();
          say(`Duplicated ${entry.name} as ${made.model}`);
        } catch (err) {
          fail(err as Error);
        }
      },
    });
  };

  const rename = (entry: WorkspaceEntry) => {
    if (entry.kind !== "class") {
      say("Studio renames classes; rename a package folder outside it for now", "error");
      return;
    }
    setPromptModal({
      title: `Rename ${entry.name}`,
      label: "New class name",
      value: entry.name,
      confirmLabel: "Rename",
      onConfirm: async (name) => {
        if (name === entry.name) return;
        try {
          const made = await actions.renameClass({ file: entry.path, name: entry.name, newName: name, within: withinOf(entry) });
          modelCache.current.delete(entry.path);
          modelCache.current.delete(made.file);
          setDocs((list) => list.map((doc) => (doc.file === entry.path ? { file: made.file, name: made.model } : doc)));
          if (entry.path === model?.file) await openDocument(made.file);
          refreshWorkspace();
          say(`Renamed ${entry.name} to ${made.model}; classes that use it are not changed`);
        } catch (err) {
          fail(err as Error);
        }
      },
    });
  };

  const removeClass = (entry: WorkspaceEntry) => {
    if (entry.kind !== "class") return;
    const next = neighbour(docs, entry.path)?.file ?? workspace?.entries.find((one) => one.kind === "class" && one.path !== entry.path)?.path;
    if (entry.path === model?.file && !next) {
      say("create another class first; the last document stays open", "error");
      return;
    }
    setConfirmModal({
      title: `Delete ${entry.name}?`,
      body: `${entry.path} is removed from disk. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await actions.deleteClass({ file: entry.path, name: entry.name });
          modelCache.current.delete(entry.path);
          setDocs((list) => closeDoc(list, entry.path));
          if (entry.path === model?.file && next) await openDocument(next);
          refreshWorkspace();
          say(`Deleted ${entry.name}`);
        } catch (err) {
          fail(err as Error);
        }
      },
    });
  };

  const removePackage = (entry: WorkspaceEntry) => {
    if (entry.kind !== "package" || !workspace) return;
    const inside = (file: string) => file === entry.path || file.startsWith(`${entry.path}/`);
    const gone = workspace.entries.filter((one) => inside(one.path) && one.kind === "class").length;
    const survivors = docs.filter((doc) => !inside(doc.file));
    const outside = survivors[0]?.file ?? workspace.entries.find((one) => one.kind === "class" && !inside(one.path))?.path;
    if (docs.length > 0 && !outside) {
      say("create a class outside this package first; the last document stays open", "error");
      return;
    }
    setConfirmModal({
      title: `Delete package ${entry.name}?`,
      body: `${entry.path} and everything in it (${gone} class${gone === 1 ? "" : "es"}) is removed from disk. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await actions.deletePackage({ dir: entry.path, root: workspace.root });
          for (const doc of docs) if (inside(doc.file)) modelCache.current.delete(doc.file);
          setDocs(survivors);
          if (model?.file && inside(model.file) && outside) await openDocument(outside);
          refreshWorkspace();
          say(`Deleted package ${entry.name}`);
        } catch (err) {
          fail(err as Error);
        }
      },
    });
  };

  const handleExportStation = async () => {
    if (!api) return;
    if (!exportReady) {
      say(exportWhy, "error");
      return;
    }
    await saveCurrent();
    const id = show({ title: `Exporting ${api.model.name}`, detail: "packing the station", state: "working" });
    const outcome = await runStationExport(api, "pst", () => {});
    if (outcome.ok) {
      say(`Exported ${outcome.line}`);
      show({ id, title: `Exported ${api.model.name}`, detail: outcome.line, state: "done" });
    } else {
      say(`Export failed: ${outcome.line}`, "error");
      show({ id, title: "Export failed", detail: outcome.line, state: "failed" });
    }
  };

  const openConsole = (tab: ConsoleTab) => {
    setConsoleTab(tab);
    setConsoleShown(true);
  };

  const toggleConsole = () => {
    if (!consoleShown) openConsole("console");
    else if (consoleTab === "messages") setConsoleTab("console");
    else setConsoleShown(false);
  };

  const runCheck = async () => {
    if (!api) return;
    setChecking(true);
    try {
      const result = await actions.checkModel();
      setMessages(result.messages);
      setSelectedMessage(null);
      openConsole("messages");
      say(
        result.messages.length
          ? `check: ${result.messages.length} ${result.messages.length === 1 ? "message" : "messages"}`
          : `check: ${result.equations} / ${result.unknowns} equations / unknowns`,
      );
    } catch (err) {
      say((err as Error).message, "error");
      openConsole("console");
    } finally {
      setChecking(false);
    }
  };

  const openMessage = (message: Message) => {
    setSelectedMessage(message);
    setSourceLine(message.line ?? 0);
    setStageView("text");
    const part = model?.components.find((component) => message.text.includes(component.name))?.name;
    if (part) api?.select([part]);
  };

  // F1: the selected text, else the class of the selected part, read when the key is pressed.
  const latestApi = useRef(api);
  latestApi.current = api;
  const helpContext = () => {
    const text = window.getSelection()?.toString().trim();
    if (text) return text.split("\n")[0].slice(0, 120);
    const now = latestApi.current;
    const part = now?.model?.components.find((c) => now.selection.includes(c.name));
    return part?.class ?? "";
  };

  // every render: the File menu's handlers close over the workspace and the open model
  const commands: Command[] = [
    // File: the same items in the same order in every app (the kit's fileMenu); the model's own below
    ...fileMenu({
      noun: "model", workspace: place ?? null, file: !!model, hubs: malachite, recent: recentItems,
      onNew: () => setPromptModal({
        title: "New model",
        label: "Model name",
        value: "NewModel",
        confirmLabel: "Create",
        onConfirm: async (name) => {
          if (editorHandle.current?.dirty) await editorHandle.current.save();
          else if (actions.dirty) await actions.save();
          await actions.newModel(name.endsWith(".mo") ? name : `${name}.mo`).catch((e) => fail(e, "Couldn't make the model"));
          await readPlace();
          refreshWorkspace();
        },
      }),
      onOpenFile: openFile,
      onOpenFolder: pickFolder,
      onConnect: openConnect,
      onSave: () => void saveCurrent().catch((e) => fail(e, "Couldn't save")),
      onSaveAs: saveAs,
      onCloseFile: () => model?.file && guard(undefined, (autosave) => closeDocuments([model.file!], autosave)),
      onCloseWorkspace: closePlace,
      onSettings: () => setSettingsPage("general"),
    }),
    {
      id: "file.new-class",
      label: "New class…",
      menu: "model",
      group: "new",
      shortcut: "Ctrl Shift N",
      chord: { key: "n", ctrl: true, shift: true },
      enabled: !!place,
      why: "open a folder first",
      run: () => openNewClass(),
    },
    {
      id: "file.new-package",
      label: "New package…",
      menu: "model",
      group: "new",
      enabled: !!place,
      why: "open a folder first",
      run: () => newPackage(),
    },
    {
      id: "file.load-library",
      label: "Load a library…",
      menu: "model",
      group: "library",
      run: () => setLibraryModalOpen(true),
    },
    {
      id: "file.export",
      label: "Export station…",
      menu: "model",
      group: "export",
      shortcut: "Ctrl E",
      chord: { key: "e", ctrl: true },
      enabled: exportReady,
      why: exportWhy || undefined,
      run: () => void handleExportStation(),
    },

    // Edit menu
    { id: "undo", label: "Undo", menu: "edit", group: "history", shortcut: "Ctrl Z", enabled: actions.canUndo, run: actions.undo },
    { id: "redo", label: "Redo", menu: "edit", group: "history", shortcut: "Ctrl Shift Z", enabled: actions.canRedo, run: actions.redo },

    // Model menu (#68)
    {
      id: "model.check",
      label: "Check",
      menu: "model",
      group: "check",
      shortcut: "Ctrl Shift C",
      chord: { key: "c", ctrl: true, shift: true },
      enabled: Boolean(model),
      run: () => void runCheck(),
    },
    {
      id: "model.flat",
      label: "Show the flat model",
      menu: "model",
      group: "check",
      shortcut: "Ctrl Shift F",
      chord: { key: "f", ctrl: true, shift: true },
      enabled: Boolean(model),
      run: () => (setView("flat"), setSide(() => true)),
    },
    {
      id: "model.messages",
      label: "Messages",
      menu: "model",
      group: "show",
      meta: messages.length ? String(messages.length) : undefined,
      checked: consoleShown && consoleTab === "messages",
      enabled: Boolean(model),
      run: () => openConsole("messages"),
    },

    // Model menu: Simulate and its settings (Check and the flat model are above)
    { id: "simulate", label: "Simulate", menu: "model", group: "simulate", shortcut: "Ctrl R", chord: { key: "r", ctrl: true }, enabled: !!model && !running, why: running ? "a simulation is running" : "open a model first", run: () => (setSide(() => true), requestAnimationFrame(() => window.dispatchEvent(new Event("articula:simulate")))) },
    { id: "cancel-simulate", label: "Cancel simulation", menu: "model", group: "simulate", enabled: running, why: "no simulation is running", run: () => window.dispatchEvent(new Event("articula:cancel")) },
    { id: "solver", label: "Solver settings…", menu: "model", group: "solver", run: () => (setSide(() => true), window.dispatchEvent(new Event("articula:solver"))) },
    { id: "libraries", label: "Libraries…", menu: "model", group: "libraries", run: () => setPackagesOpen(true) },

    // View menu
    { id: "view.search", label: "Command search…", menu: "view", group: "search", shortcut: "Ctrl K", chord: SEARCH_CHORD, quiet: true, run: () => setSearchOpen(true) },
    { id: "rail", label: "Files and library", menu: "view", group: "panes", shortcut: "Ctrl B", chord: { key: "b", ctrl: true }, checked: !railHidden, run: () => toggle("l") },
    { id: "side", label: "Source and Simulate", menu: "view", group: "panes", shortcut: "Ctrl Alt B", chord: { key: "b", ctrl: true, alt: true }, checked: side, run: () => toggle("r") },
    { id: "console", label: "Console", menu: "view", group: "panes", shortcut: "Ctrl J", chord: { key: "j", ctrl: true }, checked: consoleShown, run: toggleConsole },
    ...stageOptions.map((option): Command => ({ id: `stage-${option.value}`, label: option.label, menu: "view", group: "stage", checked: stageView === option.value, run: () => setStageView(option.value) })),
    { id: "flat", label: "Flat model", menu: "view", group: "source", checked: view === "flat", run: () => (setView("flat"), setSide(() => true)) },
    { id: "cpp", label: "Causal ODE (C++)", menu: "view", group: "source", checked: view === "cpp", run: () => (setView("cpp"), setSide(() => true)) },
    ...(["code", "split", "scopes"] as Focus[]).map((f): Command => ({ id: `focus-${f}`, label: f === "split" ? "Source and plots" : f === "code" ? "Source only" : "Plots only", menu: "view", group: "focus", checked: focus === f, run: () => (setFocus(f), setSide(() => true)) })),
    { id: "sheet", label: "Interface sheet", menu: "view", group: "sheet", shortcut: "Alt V", chord: { key: "v", alt: true }, run: () => setSheet((s) => !s) },
    ...THEMES.map((t): Command => ({ id: `theme-${t}`, label: t[0].toUpperCase() + t.slice(1), menu: "view", group: "theme", checked: theme === t, run: () => setTheme(t) })),
    { ...helpCommand(() => setHelpQuery(helpContext())), menu: "help" },
    // Ctrl / in the text editor is its toggle comment: the key opens Settings only from outside it
    { id: "help.shortcuts", label: "Keyboard shortcuts", menu: "help", group: "help", shortcut: "Ctrl /", chord: { key: "/", ctrl: true },
      enabled: () => !document.activeElement?.closest(".cm-editor"), run: () => setSettingsPage("shortcuts") },
    { id: "about", label: "About Articula", menu: "help", group: "about", run: () => setAboutOpen(true) },
  ];
  useShortcuts(commands);
  const helpProvider = useMemo(() => omHelp(omc), [omc]);

  const searchItems = useMemo<SearchItem[]>(() => [
    ...commands.filter((c) => !c.quiet).map((c): SearchItem => ({ id: c.id, label: c.label, group: "Commands", shortcut: c.shortcut, disabled: c.enabled === false, why: c.why, run: c.run })),
    ...(workspace?.entries ?? []).filter((e) => e.kind === "class").map((e): SearchItem => ({ id: `file:${e.path}`, label: e.name, group: "Files", detail: e.path.slice((workspace?.root.length ?? 0) + 1), run: () => void openDocument(e.path) })),
  ], [commands, workspace]);
  const live = running || status.state === "checking";
  const omcVersion = /\d+\.\d+\.\d+/.exec(status.version)?.[0];

  return (
    <StudioContext.Provider value={api}>
      <div className={`win studio frame${stageView === "text" || stageView === "icon" ? " no-dock" : ""}`}>
        <header className="bar">
          <span className="lk"><AppMark app="articula" size={26} idle={!live} label="Articula" /><span className="wm">Articula</span></span>
          <MenuBar commands={commands} menus={MENUS} />
          {place && (
            <WorkspaceWell workspace={place} home={home} recent={recentItems} hubs={hubs ?? []} opening={opener.opening} onOpenFolder={pickFolder} onConnect={openConnect}
              onClose={closePlace} onSwitchHub={connect} onNewHub={newHub} onOpenInMalachite={openInMalachite} onUseFolder={pickFolder} />
          )}
          <span className="bend">
            {model && <Key size="sm" kind="quiet" icon="check" disabled={checking} onClick={() => void runCheck()} title="Check the model (Ctrl Shift C)">{checking ? "Checking…" : "Check"}</Key>}
            {running
              ? <Key busy onClick={() => window.dispatchEvent(new Event("articula:cancel"))} title="Cancel the simulation">Cancel</Key>
              : model && <Key kind="primary" icon="play" onClick={() => (toggle("r", false), requestAnimationFrame(() => window.dispatchEvent(new Event("articula:simulate"))))} title="Simulate (Ctrl R)">Simulate</Key>}
            <RuntimesKey scope="this workspace" runtimes={[{
              id: "omc", name: `OpenModelica${omcVersion ? ` ${omcVersion}` : ""}`, lang: "omc", via: status.mode,
              state: running ? "busy" : status.state === "checking" ? "starting" : status.state === "failed" ? "failed" : "idle",
              now: running ? "simulating" : "working", note: status.state === "failed" ? "the next call starts a new session" : undefined,
            }]} footer={(close) => <><span>Libraries live with this workspace.</span><Key size="sm" kind="quiet" icon="package" onClick={() => { close(); setPackagesOpen(true); }}>Libraries…</Key></>} />
            <Notifications {...notes} />
            <PanelsKey panels={PANELS.map((p) => ({ id: p.side, label: p.name, keys: p.keys, shown: !hidden[p.side] }))} layout={LAYOUT} onToggle={(id) => toggle(id as Side)} />
            <WindowKeys />
          </span>
        </header>
        {!booted ? (
          <Opening status={status} stage={stage} error={error} ready={actions.ready && place !== undefined} onReady={() => setBooted(true)}
            onRetry={() => location.reload()} log={() => omc.history()} />
        ) : !place ? (
          <main className="ws">
            <div className="mid bay start-bay">
              <div className="panel start-card">
                <Start app="Articula" noun="model" nouns="models" hubs={malachite} recent={recent} home={home} opening={opener.opening}
                  onOpenFolder={pickFolder} onOpenFile={openFile} onNew={() => commands.find((c) => c.id === "file.new")?.run()} onConnect={openConnect}
                  onRecent={openRecent} onDrop={onDrop} />
              </div>
            </div>
          </main>
        ) : (
          <main className="ws">
            <Rail
              tab={rail}
              onTab={setRail}
              collapsed={railHidden}
              onToggle={(h) => toggle("l", h)}
              workspace={workspace}
              git={git}
              active={model?.file}
              onOpen={(file) => void openDocument(file)}
              onNewClass={openNewClass}
              onNewPackage={newPackage}
              onDuplicate={duplicate}
              onRename={rename}
              onDelete={(entry) => (entry.kind === "package" ? removePackage(entry) : removeClass(entry))}
              onMove={(source, target) => void moveEntry(source, target)}
              onCopyPath={(entry) => {
                void navigator.clipboard?.writeText(entry.path);
                say(`Copied ${entry.path}`);
              }}
            >
              <Library omc={omc} model={model?.name ?? ""} onPlace={(cls) => model && api && void actions.place(cls, freeSpot(model)).then((name) => api.select([name]))} />
            </Rail>
            {!api || !model ? (
              <div className="mid bay empty-bay">
                <main className="panel stage" aria-label="No model open">
                  <p className="stage-empty"><span>No model open: pick one in Files, or New model (Ctrl N).</span></p>
                </main>
              </div>
            ) : <>
            <Gutter label="Simulate width" size={hidden.r ? 38 : simWidth} defaultSize={420} min={320} otherMin={420}
              onSize={(w) => (setSimWidth(w), hidden.r && toggle("r", false))} onHidden={() => toggle("r", true)}>
            <div className="mid bay">
              <main className="panel stage" aria-label={model.name}>
                <EditorTabs label="Open models" current={model.file} menu={docMenu}
                  tabs={shownDocs.map((d) => ({ id: d.file, label: d.name, icon: <span className="ck ck-model">M</span>, dirty: d.file === model.file && (actions.dirty || textDirty), pinned: pinned.has(d.file), closable: shownDocs.length > 1 }))}
                  onShow={(f) => void openDocument(f)} onClose={(f) => void closeDocuments([f])}>
                  <Key size="sm" kind="quiet" round icon="add" label="Open a .mo file" onClick={openFile} />
                  <Segmented<Stage> label="View" size="sm" value={stageView} onChange={setStageView} options={stageOptions} />
                </EditorTabs>
                <div className="stage-view">
                  <div className="stage-pane" hidden={stageView !== "diagram"}>
                    <Canvas api={api} actions={actions} classes={classes} onOpen={setPopover} />
                  </div>
                  {stageView === "3d" &&
                    (shapeRun?.shapes?.length ? (
                      <Viewport3D run={shapeRun} theme={shown} />
                    ) : (
                      <p className="stage-empty"><span>Simulate a <span className="mono">Modelica.Mechanics.MultiBody</span> model to see it here.</span></p>
                    ))}
                  <div className="stage-pane" hidden={stageView !== "text"}>
                    <TextStage
                      model={model}
                      actions={actions}
                      line={sourceLine}
                      theme={shown}
                      settings={settings.editor}
                      base={model.file ? git?.head[model.file] ?? null : null}
                      onEditor={(handle) => {
                        editorHandle.current = handle;
                        setTextDirty(handle?.dirty ?? false);
                      }}
                    />
                  </div>
                  {stageView === "icon" && <IconView />}
                  <div className="dock-slot">
                    <StudioDock
                      canExport={exportReady}
                      why={exportWhy}
                      beforeExport={saveCurrent}
                      onLog={(text, level) => {
                        setConsoleTab("console");
                        setConsoleShown(true);
                        say(text, level);
                      }}
                    />
                  </div>
                </div>
              </main>
              <StudioConsole
                logs={logs}
                messages={messages}
                tab={consoleTab}
                selected={selectedMessage}
                checking={checking}
                hidden={hidden.b}
                onHidden={(h) => toggle("b", h)}
                onTab={setConsoleTab}
                onSelect={setSelectedMessage}
                onOpen={openMessage}
                onCheck={() => void runCheck()}
              />
            </div>
            <Panel name="Simulate" side="right" icon="play" width={simWidth} hidden={hidden.r} onHidden={(h) => toggle("r", h)} className={`simside focus-${focus}`}
              head={<Segmented<Focus> label="Focus" value={focus} onChange={setFocus} options={[
                { value: "code", label: "Source", hint: "The source fills the card" },
                { value: "split", label: "Both", hint: "Source above, plots below" },
                { value: "scopes", label: "Plots", hint: "The plots fill the card" },
              ]} />}>
              <Split model={model} actions={actions} view={view} onView={setView} settings={settings.editor} appTheme={shown} />
              <Simulate actions={actions} model={model} onToast={show} onRunningChange={setRunning} onRun={(r) => setShapeRun(r.shapes?.length ? r : null)} />
            </Panel>
            </Gutter>
            {popover && <ComponentPopover component={popover} onClose={() => setPopover(null)} />}
            <InterfaceSheet open={sheet} onOpen={() => setSheet(true)} onClose={() => setSheet(false)} canExport={canExport} />
            </>}
            {newClassOpen && <NewClassSheet workspace={workspace} model={model} defaultWithin={newClassWithin} onClose={() => setNewClassOpen(false)} onCreate={createNewClass} />}
          </main>
        )}

        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            body={confirmModal.body}
            confirmLabel={confirmModal.confirmLabel}
            onConfirm={confirmModal.onConfirm}
            onClose={() => setConfirmModal(null)}
          />
        )}

        {ask === "open" && <AskOpen what="a model" types={["mo"]} hubs={hubs?.length ?? 0} onLocal={() => (setAsk(null), pickLocal())} onConnect={openConnect} onClose={() => setAsk(null)} />}
        {ask === "connect" && hubs && <ConnectHub app="Articula" hubs={hubs} opening={opener.opening} onConnect={(id) => (setAsk(null), connect(id))} onNew={() => (setAsk(null), newHub())} onClose={() => setAsk(null)} />}
        {ask === "pickOpen" && place && hub && (
          <OpenFile what="a model" types={["mo"]} kinds="Models" hub={hub} list={() => omc.op<FileEntry[]>("hub_files", { root: place.root })} describe={describeFile}
            onClose={() => setAsk(null)} onOpen={(path) => (setAsk(null), void openDocument(`${place.root}/${path}`))} />
        )}
        {ask === "pickSave" && place && hub && (
          <SaveFile what="the model" types={["mo"]} hub={hub} list={() => omc.op<FileEntry[]>("hub_files", { root: place.root })} name={modelFile ? baseName(modelFile) : `${model?.name}.mo`}
            onClose={() => setAsk(null)} onSave={(path) => (setAsk(null), void saveAsTo(`${place.root}/${path}`))} />
        )}
        {(ask === "folder" || ask === "file") && (
          <TypedPath title={ask === "folder" ? "Open folder" : "Open a local file"} what={ask} initial={place && ask === "folder" ? "" : place ? `${place.root}/` : ""}
            onClose={() => setAsk(null)} onOpen={(p) => (setAsk(null), ask === "folder" ? openFolder(p) : void openDocument(p))} />
        )}
        {unsaved && model && (
          <Unsaved name={modelFile ? baseName(modelFile) : model.name} closing={unsaved.closing}
            onSave={() => { const go = unsaved.then; setUnsaved(null); void saveCurrent().then(() => go(true), (e) => fail(e, "Couldn't save")); }}
            onDiscard={() => { const go = unsaved.then; setUnsaved(null); void go(false); }}
            onClose={() => setUnsaved(null)} />
        )}
        {promptModal && (
          <PromptModal
            title={promptModal.title}
            label={promptModal.label}
            value={promptModal.value}
            placeholder={promptModal.placeholder}
            confirmLabel={promptModal.confirmLabel}
            onConfirm={promptModal.onConfirm}
            onClose={() => setPromptModal(null)}
          />
        )}

        {libraryModalOpen && (
          <LibraryModal
            onLoad={(lib) => {
              const id = show({ title: `Loading ${lib}`, state: "working" });
              return actions.loadLibrary(lib).then(
                () => void show({ id, title: `Loaded ${lib}`, detail: "in the Library", state: "done" }),
                (e: Error) => (say(e.message, "error"), void show({ id, title: `Couldn't load ${lib}`, detail: e.message, state: "failed" })),
              );
            }}
            onClose={() => setLibraryModalOpen(false)}
          />
        )}

        {packagesOpen && (
          <PackageWindow title="Modelica libraries" tags={[status.version || "omc", "this workspace"]} onClose={() => setPackagesOpen(false)}>
            <Packages omc={omc} onInstalled={(name) => show({ title: `Installed ${name}`, detail: "load it from the Library", state: "done" })} />
          </PackageWindow>
        )}

        {aboutOpen && <About app="articula" role="Acausal physical modelling on OpenModelica" version={STUDIO_VERSION}
          paperboat={paperboat} info={`omc ${/\d+\.\d+\.\d+/.exec(status.version)?.[0] ?? "…"} · protocol articula/0`}
          repo="paperboatlab/articula" credits={CREDITS} onClose={() => setAboutOpen(false)} />}
        {settingsPage && (
          <Settings app="Articula" page={settingsPage} onClose={() => setSettingsPage(null)} pages={[
            { id: "general", label: "General", icon: "a-settings", body: <><ThemeSetting theme={theme} onTheme={setTheme} /><ScaleSetting scale={scale} onScale={setScale} /></> },
            { id: "articula", label: "Articula", icon: "mark-articula", body: <>
              <SettingsSection title="OpenModelica">
                <SettingRow label="omc" hint={`${status.state === "ready" ? "Running" : status.state === "failed" ? "Stopped: the next call starts a new session" : "Starting"}${status.mode ? `, ${status.mode === "native" ? "on this computer" : `in ${status.mode}`}` : ""}; one session per workspace`}>
                  <span className="well">{omcVersion ?? "…"}</span>
                </SettingRow>
                <SettingRow label="Libraries" hint="Modelica libraries live with this workspace">
                  <Key size="sm" icon="package" onClick={() => (setSettingsPage(null), setPackagesOpen(true))}>Libraries…</Key>
                </SettingRow>
              </SettingsSection>
              <SettingsSection title="Simulation">
                <SettingRow label="Solver" hint="omc's integrator, kept per model">
                  <Key size="sm" disabled={!model} title={model ? undefined : "open a model first"} onClick={() => (setSettingsPage(null), commands.find((c) => c.id === "solver")?.run())}>Solver settings…</Key>
                </SettingRow>
              </SettingsSection>
              <SettingsSection title="Export">
                <SettingRow label="Station" hint="A model or block becomes a Paperboat station (.pst) for Simplicial">
                  <Key size="sm" disabled={!exportReady} title={exportWhy || undefined} onClick={() => (setSettingsPage(null), void handleExportStation())}>Export station…</Key>
                </SettingRow>
              </SettingsSection>
            </> },
            { id: "editor", label: "Editor", icon: "file-code", body: <EditorSettingsPane settings={settings.editor} onSettings={settings.setEditor} file={settings.file} /> },
            ...(place?.kind === "hub" ? [{ id: "hub", label: "Hub", icon: "mark-malachite" as const, body: <div className="hub-settings">
              <SettingsSection title="The hub">
                <SettingRow label="Name"><span className="well">{place.name}</span></SettingRow>
                <SettingRow label="Folder"><span className="well wide" title={place.root}><Icon name="folder" size={14} /><span>{`\u200e${hub?.path ?? place.root}`}</span></span></SettingRow>
                <SettingRow label="Switch hub" hint="The open models close; unsaved changes ask first">
                  <Key size="sm" onClick={() => (setSettingsPage(null), openConnect())}>Switch hub…</Key>
                </SettingRow>
                <SettingRow label="Close hub" hint="Back to the Start page">
                  <Key size="sm" onClick={() => (setSettingsPage(null), closePlace())}>Close hub</Key>
                </SettingRow>
                <SettingRow label="The hub's own settings" hint="Its author, history and what it leaves out are set in Malachite">
                  <Key size="sm" icon="mark-malachite" onClick={() => (setSettingsPage(null), openInMalachite())}>Open in Malachite</Key>
                </SettingRow>
              </SettingsSection>
            </div> }] : []),
            { id: "shortcuts", label: "Shortcuts", icon: "keys", body: <ShortcutList commands={commands} menus={MENUS} /> },
          ]} />
        )}
        {helpQuery !== null && <HelpWindow app="Articula" provider={helpProvider} commands={commands} query={helpQuery} onClose={() => setHelpQuery(null)} />}

        <Toasts toasts={notes.toasts} onDismiss={notes.dismiss} />
        {searchOpen && <Search items={searchItems} scopes={["All", "Commands", "Files"]} placeholder={`Search ${place ? place.name : "the commands"}, or run a command`} onClose={() => setSearchOpen(false)} />}

      </div>
    </StudioContext.Provider>
  );
}
