// Articula: an OpenModelica editor (agent-docs/rebrand; the window of Julix and Malachite): the bar (mark,
// menus, the model, Check and Simulate, the runtimes key, the Panels key, the theme); Files and Library
// at the left; the model's views in the middle (diagram, icon, 3D, text) over the Console; the source
// and Simulate at the right. Provides StudioContext; the popover opens on a component click, the
// interface sheet on Alt V, the export dock under the stage.

import { ReactFlowProvider } from "@xyflow/react";
import { AppMark, Key, MenuBar, Notifications, Panel, PanelsKey, Search, Segmented, Split as Gutter, ThemePicker, Toasts, readStored, useToasts, writeStored, type PaneRect, type SearchItem } from "@paperboatlab/ui";
import { HelpWindow } from "@paperboatlab/ui";
import { afterClose, orderTabs, tabMenu } from "@paperboatlab/ui/editor";
import { helpCommand, SEARCH_CHORD, useShortcuts, type Command } from "@paperboatlab/ui";
import { omHelp } from "./shell/help.ts";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAppConfig as useSqueroConfig, type ConfigStore } from "@paperboatlab/ui/editor";
import { Canvas } from "./canvas/Canvas.tsx";
import { runStationExport } from "./dock/dock.ts";
import { StudioDock } from "./dock/index.tsx";
import { Library, useClassIndex } from "./library/Library.tsx";
import { PackageWindow } from "@paperboatlab/ui/packages";
import { Packages } from "./library/Packages.tsx";
import { StudioContext, type StudioModel } from "./model/types.ts";
import { OmcClient, type OmcStatus } from "./omc/omc.ts";
import { type Log, type Message } from "@paperboatlab/ui";
import { ComponentPopover } from "./popover/index.tsx";
import { InterfaceSheet } from "./sheet/index.tsx";
import { IconView } from "./icon/IconView.tsx";
import { AboutModal } from "./shell/AboutModal.tsx";
import { ConfirmModal, LibraryModal, PromptModal } from "./shell/Dialogs.tsx";
import { OmcKey } from "./shell/OmcKey.tsx";
import { MENUS } from "./shell/menus.ts";
import { THEMES, useTheme } from "@paperboatlab/ui";
import { Opening } from "./shell/Opening.tsx";
import { Simulate } from "./simulate/Simulate.tsx";
import { Viewport3D, type ShapeRun } from "./viewport3d/Viewport3D.tsx";
import { Split, type View } from "./split/Split.tsx";
import { StudioConsole, type ConsoleTab } from "./shell/StudioConsole.tsx";
import { DocTabs } from "./shell/DocTabs.tsx";
import { Rail, type RailTab } from "./shell/Rail.tsx";
import { TextStage, type TextEditorHandle } from "./shell/TextStage.tsx";
import { NewClassSheet } from "./shell/NewClassSheet.tsx";
import type { NewClassSpec } from "./shell/newClass.ts";
import { closeDoc, neighbour, openDoc, workspaceName, type Doc, type GitState, type Workspace, type WorkspaceEntry } from "./shell/workspace.ts";
import { packageName } from "./shell/newClass.ts";
import { freeSpot } from "./store/plans.ts";
import { useStudioStore } from "./store/index.tsx";

type Focus = "code" | "split" | "scopes";
type Stage = "diagram" | "icon" | "3d" | "text";

function serverUrl(): string {
  const given = new URLSearchParams(location.search).get("server");
  if (given) return given;
  return !location.host ? "ws://localhost:59240" : `ws://${location.host}`;
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

type ConfirmSpec = {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};

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
  const workspaceCache = useRef(new Map<string, Workspace>());
  const [shapeRun, setShapeRun] = useState<ShapeRun | null>(null);
  // The app theme and the editor settings, from the user's squero.toml (shared with MX).
  const settings = useSqueroConfig(config, { editor: "articula.editor", theme: "paperboat.theme" });
  const { theme, setTheme } = settings;
  const shown = useTheme(theme);
  const [promptModal, setPromptModal] = useState<PromptSpec | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmSpec | null>(null);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helpQuery, setHelpQuery] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false); // the command search (Ctrl+K)
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const classes = useClassIndex(omc);

  const model = api?.model;
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

  // The folder the model sits in, for the Files rail. A workspace read is never fatal: the rail
  // just shows the open documents when the server can't list the folder.
  useEffect(() => {
    const file = model?.file;
    if (!file) {
      setWorkspace(null);
      return;
    }
    const cached = workspaceCache.current.get(file);
    if (cached) {
      setWorkspace(cached);
      return;
    }
    let live = true;
    omc.op<Workspace>("workspace", { file }).then(
      (next) => {
        if (!live) return;
        setWorkspace(next);
        workspaceCache.current.set(file, next);
      },
      () => live && setWorkspace(null),
    );
    return () => {
      live = false;
    };
  }, [omc, model?.file, workspaceTick]);

  // Git, for the Text view's gutter and the rail's M/U: read again when the folder or what is saved
  // changes, and when the window regains focus (a commit in a terminal, say).
  const [git, setGit] = useState<GitState | null>(null);
  const [gitTick, setGitTick] = useState(0);
  useEffect(() => {
    const bump = () => setGitTick((n) => n + 1);
    window.addEventListener("focus", bump);
    return () => window.removeEventListener("focus", bump);
  }, []);
  const gitRoot = workspace?.root;
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

  /** A create/delete/duplicate changed the folder: forget every listing and read the active one again. */
  const refreshWorkspace = () => {
    workspaceCache.current.clear();
    setWorkspaceTick((t) => t + 1);
  };

  useEffect(() => {
    if (actions.notice) say(actions.notice);
  }, [actions.notice]);

  const saveCurrent = async () => {
    const editor = editorHandle.current;
    if (editor?.dirty) return editor.save();
    return actions.save();
  };

  /** Switch documents: save the current one first, so a tab is never a stale buffer. */
  const openDocument = async (file: string, content?: string) => {
    if (file === model?.file) return;
    try {
      const editor = editorHandle.current;
      if (editor?.dirty) await editor.save();
      else if (actions.dirty) await actions.save();
      const cached = content === undefined ? modelCache.current.get(file) : undefined;
      if (cached) actions.restore(cached);
      else await actions.openFile(file, content);
    } catch (err) {
      fail(err as Error);
    }
  };

  /** Close tabs (the kit's rules: the right neighbour shows, else the left). A model always shows, so
   *  closing every tab keeps the shown one; the shown one is saved by openDocument before it goes. */
  const closeDocuments = async (paths: string[]) => {
    const current = model?.file ?? null;
    const closing = paths.length >= docs.length ? paths.filter((p) => p !== current) : paths;
    if (!closing.length) return;
    const after = afterClose(orderTabs(docs.map((d) => d.file), pinned), current, closing);
    setDocs((list) => list.filter((d) => !closing.includes(d.file)));
    setPinned((now) => new Set([...now].filter((f) => !closing.includes(f))));
    if (after.current && after.current !== current) await openDocument(after.current);
  };
  const closeDocument = (doc: Doc) => closeDocuments([doc.file]);
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

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result ?? "");
      // Import into the workspace being authored, not the server's cwd: the package tree stays.
      const target = workspace?.root ? `${workspace.root}/${file.name}` : file.name;
      try {
        await openDocument(target, content);
      } catch (err) {
        fail(err as Error);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
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

  const commands = useMemo<Command[]>(
    () => [
      // File menu (Issue #11)
      {
        id: "file.new",
        label: "New Model",
        menu: "file",
        group: "model",
        shortcut: "Ctrl+N",
        chord: { key: "n", ctrl: true },
        run: () =>
          setPromptModal({
            title: "New Model",
            label: "Model Name",
            value: "NewModel.mo",
            confirmLabel: "Create",
            onConfirm: async (name) => {
              if (editorHandle.current?.dirty) await editorHandle.current.save();
              else if (actions.dirty) await actions.save();
              const target = workspace?.root ? `${workspace.root}/${name.endsWith(".mo") ? name : `${name}.mo`}` : undefined;
              await actions.newModel(name, target);
            },
          }),
      },
      {
        id: "file.new-class",
        label: "New Class…",
        menu: "file",
        group: "model",
        shortcut: "Ctrl+Shift+N",
        chord: { key: "n", ctrl: true, shift: true },
        run: () => openNewClass(),
      },
      {
        id: "file.new-package",
        label: "New Package…",
        menu: "file",
        group: "model",
        run: () => newPackage(),
      },
      {
        id: "file.open",
        label: "Open / Import .mo…",
        menu: "file",
        group: "model",
        shortcut: "Ctrl+O",
        chord: { key: "o", ctrl: true },
        run: () => fileInputRef.current?.click(),
      },
      {
        id: "file.open-path",
        label: "Open from Path…",
        menu: "file",
        group: "model",
        run: () =>
          setPromptModal({
            title: "Open Modelica File",
            label: "File Path",
            placeholder: "e.g. models/MyModel.mo",
            confirmLabel: "Open",
            onConfirm: (path) => openDocument(path),
          }),
      },
      {
        id: "file.save",
        label: "Save",
        menu: "file",
        group: "save",
        shortcut: "Ctrl+S",
        chord: { key: "s", ctrl: true },
        enabled: Boolean(model),
        run: () => void saveCurrent().catch((e) => fail(e, "Couldn't save")),
      },
      {
        id: "file.save-as",
        label: "Save As…",
        menu: "file",
        group: "save",
        shortcut: "Ctrl+Shift+S",
        chord: { key: "s", ctrl: true, shift: true },
        enabled: Boolean(model),
        run: () =>
          setPromptModal({
            title: "Save Model As",
            label: "File Path",
            value: model?.file ?? `${model?.name}.mo`,
            confirmLabel: "Save",
            onConfirm: (path) => actions.saveAs(path).catch((e) => fail(e, "Couldn't save")),
          }),
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
        shortcut: "Ctrl+E",
        chord: { key: "e", ctrl: true },
        enabled: exportReady,
        why: exportWhy || undefined,
        run: () => void handleExportStation(),
      },

      // Edit menu
      { id: "undo", label: "Undo", menu: "edit", group: "history", shortcut: "Ctrl+Z", enabled: actions.canUndo, run: actions.undo },
      { id: "redo", label: "Redo", menu: "edit", group: "history", shortcut: "Ctrl+Shift+Z", enabled: actions.canRedo, run: actions.redo },

      // Model menu (#68)
      {
        id: "model.check",
        label: "Check",
        menu: "model",
        group: "check",
        shortcut: "Ctrl+Shift+C",
        chord: { key: "c", ctrl: true, shift: true },
        enabled: Boolean(model),
        run: () => void runCheck(),
      },
      {
        id: "model.flat",
        label: "Show the flat model",
        menu: "model",
        group: "check",
        shortcut: "Ctrl+Shift+F",
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
      { id: "simulate", label: "Simulate", menu: "model", group: "simulate", shortcut: "Ctrl+R", chord: { key: "r", ctrl: true }, enabled: !!model && !running, why: running ? "a simulation is running" : "open a model first", run: () => (setSide(() => true), requestAnimationFrame(() => window.dispatchEvent(new Event("articula:simulate")))) },
      { id: "cancel-simulate", label: "Cancel simulation", menu: "model", group: "simulate", enabled: running, why: "no simulation is running", run: () => window.dispatchEvent(new Event("articula:cancel")) },
      { id: "solver", label: "Solver settings…", menu: "model", group: "solver", run: () => (setSide(() => true), window.dispatchEvent(new Event("articula:solver"))) },
      { id: "libraries", label: "Libraries…", menu: "model", group: "libraries", run: () => setPackagesOpen(true) },

      // View menu
      { id: "view.search", label: "Command search…", menu: "view", group: "search", shortcut: "Ctrl+K", chord: SEARCH_CHORD, quiet: true, run: () => setSearchOpen(true) },
      { id: "rail", label: "Files and library", menu: "view", group: "panes", shortcut: "Ctrl+B", chord: { key: "b", ctrl: true }, checked: !railHidden, run: () => toggle("l") },
      { id: "side", label: "Source and Simulate", menu: "view", group: "panes", shortcut: "Ctrl+Alt+B", chord: { key: "b", ctrl: true, alt: true }, checked: side, run: () => toggle("r") },
      { id: "console", label: "Console", menu: "view", group: "panes", shortcut: "Ctrl+J", chord: { key: "j", ctrl: true }, checked: consoleShown, run: toggleConsole },
      ...stageOptions.map((option): Command => ({ id: `stage-${option.value}`, label: option.label, menu: "view", group: "stage", checked: stageView === option.value, run: () => setStageView(option.value) })),
      { id: "flat", label: "Flat model", menu: "view", group: "source", checked: view === "flat", run: () => (setView("flat"), setSide(() => true)) },
      { id: "cpp", label: "Causal ODE (C++)", menu: "view", group: "source", checked: view === "cpp", run: () => (setView("cpp"), setSide(() => true)) },
      ...(["code", "split", "scopes"] as Focus[]).map((f): Command => ({ id: `focus-${f}`, label: f === "split" ? "Source and plots" : f === "code" ? "Source only" : "Plots only", menu: "view", group: "focus", checked: focus === f, run: () => (setFocus(f), setSide(() => true)) })),
      { id: "sheet", label: "Interface sheet", menu: "view", group: "sheet", shortcut: "Alt+V", chord: { key: "v", alt: true }, run: () => setSheet((s) => !s) },
      ...THEMES.map((t): Command => ({ id: `theme-${t}`, label: t[0].toUpperCase() + t.slice(1), menu: "view", group: "theme", checked: theme === t, run: () => setTheme(t) })),
      { ...helpCommand(() => setHelpQuery(helpContext())), menu: "help" },
      { id: "about", label: "About Articula", menu: "help", group: "about", run: () => setAboutOpen(true) },
    ],
    [actions.canUndo, running, hidden, actions.canRedo, actions.undo, actions.redo, actions.newModel, actions.openFile, actions.save, actions.saveAs, side, railHidden, view, stageView, stageOptions, focus, theme, setTheme, model, api, consoleShown, consoleTab, messages.length, runCheck, openConsole, toggleConsole, saveCurrent, exportReady, exportWhy],
  );
  useShortcuts(commands);
  const helpProvider = useMemo(() => omHelp(omc), [omc]);

  const searchItems = useMemo<SearchItem[]>(() => [
    ...commands.filter((c) => !c.quiet).map((c): SearchItem => ({ id: c.id, label: c.label, group: "Commands", shortcut: c.shortcut, disabled: c.enabled === false, why: c.why, run: c.run })),
    ...(workspace?.entries ?? []).filter((e) => e.kind === "class").map((e): SearchItem => ({ id: `file:${e.path}`, label: e.name, group: "Files", detail: e.path.slice((workspace?.root.length ?? 0) + 1), run: () => void openDocument(e.path) })),
  ], [commands, workspace]);
  const live = running || status.state === "checking";

  return (
    <StudioContext.Provider value={api}>
      <div className={`win studio${stageView === "text" || stageView === "icon" ? " no-dock" : ""}`}>
        <header className="bar">
          <AppMark app="articula" size={26} idle={!live} label="Articula" />
          <span className="wm">Articula</span>
          <MenuBar commands={commands} menus={MENUS} />
          {model && <span className="well proj" title={model.file}>{model.name}{fileDirty && <i className="dot" title="Not saved" />}</span>}
          <span className="bend">
            {model && <Key size="sm" kind="quiet" icon="check" disabled={checking} onClick={() => void runCheck()} title="Check the model (Ctrl Shift C)">{checking ? "Checking…" : "Check"}</Key>}
            {running
              ? <Key busy onClick={() => window.dispatchEvent(new Event("articula:cancel"))} title="Cancel the simulation">Cancel</Key>
              : <Key kind="primary" icon="play" disabled={!model} onClick={() => (toggle("r", false), requestAnimationFrame(() => window.dispatchEvent(new Event("articula:simulate"))))} title="Simulate (Ctrl R)">Simulate</Key>}
            <OmcKey status={status} running={running} onLibraries={() => setPackagesOpen(true)} />
            <PanelsKey panels={PANELS.map((p) => ({ id: p.side, label: p.name, keys: p.keys, shown: !hidden[p.side] }))} layout={LAYOUT} onToggle={(id) => toggle(id as Side)} />
            <span className="lsep" />
            <Notifications {...notes} />
            <ThemePicker theme={theme} onChange={setTheme} />
          </span>
        </header>
        {api && model ? (
          <main className="ws">
            <Rail
              tab={rail}
              onTab={setRail}
              collapsed={railHidden}
              onToggle={(h) => toggle("l", h)}
              workspace={workspace}
              git={git}
              active={model.file}
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
              <Library omc={omc} model={model.name} onPlace={(cls) => void actions.place(cls, freeSpot(model)).then((name) => api.select([name]))} />
            </Rail>
            <Gutter label="Simulate width" size={hidden.r ? 38 : simWidth} defaultSize={420} min={320} otherMin={420}
              onSize={(w) => (setSimWidth(w), hidden.r && toggle("r", false))} onHidden={() => toggle("r", true)}>
            <div className="mid">
              <main className="panel stage" aria-label={model.name}>
                <div className="ntabs">
                  <DocTabs
                    docs={shownDocs}
                    pinned={pinned}
                    menu={docMenu}
                    active={model.file}
                    dirty={actions.dirty || textDirty}
                    onSelect={(doc) => void openDocument(doc.file)}
                    onClose={(doc) => void closeDocument(doc)}
                    onOpen={() => fileInputRef.current?.click()}
                  />
                  <Segmented<Stage> label="View" value={stageView} onChange={setStageView} options={stageOptions} />
                </div>
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
                      onSettings={settings.setEditor}
                      configFile={settings.file}
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
            {newClassOpen && <NewClassSheet workspace={workspace} model={model} defaultWithin={newClassWithin} onClose={() => setNewClassOpen(false)} onCreate={createNewClass} />}
          </main>
        ) : (
          <Opening status={status} stage={stage} error={error} onRetry={() => location.reload()} />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".mo,.moe"
          style={{ display: "none" }}
          onChange={handleFileInputChange}
        />

        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            body={confirmModal.body}
            confirmLabel={confirmModal.confirmLabel}
            onConfirm={confirmModal.onConfirm}
            onClose={() => setConfirmModal(null)}
          />
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

        {aboutOpen && <AboutModal omc={omc} status={status} onClose={() => setAboutOpen(false)} />}
        {helpQuery !== null && <HelpWindow app="Articula" provider={helpProvider} commands={commands} query={helpQuery} onClose={() => setHelpQuery(null)} />}

        <Toasts toasts={notes.toasts} onDismiss={notes.dismiss} />
        {searchOpen && <Search items={searchItems} scopes={["All", "Commands", "Files"]} placeholder={`Search ${workspace ? workspaceName(workspace) : "the workspace"}, or run a command`} onClose={() => setSearchOpen(false)} />}

      </div>
    </StudioContext.Provider>
  );
}
