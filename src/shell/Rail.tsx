// The left card (REBRAND card panels): Files (the workspace's classes and packages) and Library (the
// component browser), as tabs in one panel that hides to a slim bar (Ctrl B). The tree is the kit's
// FileTree; a class row shows its kind as a letter.
import { Icon, Panel, Tabs } from "@paperboatlab/ui";
import { useRef, type ReactNode } from "react";
import { FileTree, type FileEntry, type FileTreeHandle } from "@paperboatlab/ui/files";
import { gitMark, visibleEntries, workspaceName, type GitState, type Workspace, type WorkspaceEntry } from "./workspace.ts";

const KIND: Record<string, string> = { model: "M", block: "B", connector: "C", record: "R", function: "F", package: "P", type: "T", class: "C" };
function Glyph({ entry }: { entry: WorkspaceEntry }) {
  if (entry.kind === "package") return <span className="ck pkg"><Icon name="package" size={14} /></span>;
  const kind = entry.classKind ?? "class";
  return <span className={`ck ck-${kind}`} title={kind}>{KIND[kind] ?? "C"}</span>;
}

export type RailTab = "files" | "library";

export function Rail({
  tab,
  onTab,
  workspace,
  git,
  active,
  onOpen,
  onNewClass,
  onNewPackage,
  onDuplicate,
  onRename,
  onDelete,
  onCopyPath,
  onMove,
  collapsed,
  onToggle,
  children,
}: {
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  workspace: Workspace | null;
  /** M/U marks on class rows. */
  git?: GitState | null;
  active?: string;
  onOpen: (file: string) => void;
  onNewClass: (entry?: WorkspaceEntry) => void;
  onNewPackage: (entry?: WorkspaceEntry) => void;
  onDuplicate: (entry: WorkspaceEntry) => void;
  onRename: (entry: WorkspaceEntry) => void;
  onDelete: (entry: WorkspaceEntry) => void;
  onCopyPath: (entry: WorkspaceEntry) => void;
  onMove: (source: WorkspaceEntry, target?: WorkspaceEntry) => void;
  /** Hidden to its slim bar. */
  collapsed?: boolean;
  onToggle?: (hidden: boolean) => void;
  children: ReactNode;
}) {
  const tree = useRef<FileTreeHandle>(null);
  const entries: FileEntry[] = visibleEntries(workspace?.entries ?? [], new Set()).map((entry) => ({
    path: entry.path,
    name: entry.name,
    depth: entry.depth,
    kind: entry.kind === "package" ? "folder" : "file",
    glyph: <Glyph entry={entry} />,
    badge: entry.kind === "package" ? undefined : gitMark(git, entry.path) || undefined,
  }));
  const find = (entry?: FileEntry) => (entry ? workspace?.entries.find((one) => one.path === entry.path) : undefined);
  const classes = workspace?.entries.filter((entry) => entry.kind === "class").length ?? 0;

  return (
    <Panel name={workspaceName(workspace)} showName={false} side="left" icon={tab === "files" ? "folder" : "a-library"} width={272}
      hidden={collapsed} onHidden={(h) => onToggle?.(h)} className="side-files"
      count={tab === "files" ? `${classes} ${classes === 1 ? "class" : "classes"}` : undefined}
      head={<Tabs label="Files and library" value={tab} onChange={onTab} tabs={[{ value: "files", label: "Files" }, { value: "library", label: "Library" }]} />}>
      <div className="rail-body" hidden={tab !== "files"} title={workspace?.root}>
        <FileTree
          ref={tree}
          entries={entries}
          active={active}
          ariaLabel="Workspace"
          labels={{ newFile: "New class…", newFolder: "New package…", rename: "Rename…", duplicate: "Duplicate…", delete: "Delete…", copyPath: "Copy path", empty: "No .mo files here yet: File › New class (Ctrl Shift N)." }}
          actions={{
            onOpen: (entry) => onOpen(entry.path),
            onNewFile: (parent) => onNewClass(find(parent)),
            onNewFolder: (parent) => onNewPackage(find(parent)),
            onRename: (entry) => { const one = find(entry); if (one) onRename(one); },
            onDuplicate: (entry) => { const one = find(entry); if (one) onDuplicate(one); },
            onDelete: (entry) => { const one = find(entry); if (one) onDelete(one); },
            onCopyPath: (entry) => { const one = find(entry); if (one) onCopyPath(one); },
            onMove: (source, target) => { const one = find(source); if (one) onMove(one, find(target)); },
          }}
        />
      </div>
      <div className="rail-body library-slot" hidden={tab !== "library"}>{children}</div>
    </Panel>
  );
}
