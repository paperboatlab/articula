// The tabs above the stage: one per open model, underlined when shown, its dirty dot, + to open a .mo.
// REBRAND "Tab menu": a right click opens the kit's tab menu (the closes, Pin, Reveal in Files) and keeps
// the tab tinted; middle click closes; a pinned tab sits first and shows a pin for the ×. Articula always
// shows a model, so the last tab stays.
import { Icon, Key, type MenuEntry } from "@paperboatlab/ui";
import { TabMenu } from "@paperboatlab/ui/editor";
import { useState } from "react";
import type { Doc } from "./workspace.ts";

export function DocTabs({ docs, active, dirty, pinned, menu, onSelect, onClose, onOpen }: {
  /** In strip order, pinned first. */
  docs: Doc[];
  active?: string;
  dirty?: boolean;
  pinned: ReadonlySet<string>;
  /** The right-click menu of a tab (the kit's tabMenu). */
  menu: (file: string) => MenuEntry[];
  onSelect: (doc: Doc) => void;
  onClose: (doc: Doc) => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState<{ file: string; x: number; y: number } | null>(null);
  return (
    <div className="tabs2" role="tablist" aria-label="Open models">
      {docs.map((doc) => {
        const here = doc.file === active;
        const pin = pinned.has(doc.file);
        return (
          <span key={doc.file} role="tab" aria-selected={here} className={`${here ? "on" : ""}${open?.file === doc.file ? " menu" : ""}`} title={doc.file}
            onClick={() => onSelect(doc)} onAuxClick={(e) => e.button === 1 && !pin && docs.length > 1 && onClose(doc)}
            onContextMenu={(e) => { e.preventDefault(); setOpen({ file: doc.file, x: e.clientX, y: e.clientY }); }}>
            <span className="ck ck-model">M</span>{doc.name}
            {here && dirty && <i className="dot" title="Not saved" />}
            {pin
              ? <span className="tx pin" title="Pinned (right click to unpin)"><Icon name="pin" /></span>
              : docs.length > 1 && <button type="button" className="tx" aria-label={`Close ${doc.name}`} onClick={(e) => { e.stopPropagation(); onClose(doc); }}>×</button>}
          </span>
        );
      })}
      <Key size="sm" kind="quiet" round icon="add" label="Open a .mo file" onClick={onOpen} />
      {open && <TabMenu path={open.file} x={open.x} y={open.y} items={menu(open.file)} onClose={() => setOpen(null)} />}
    </div>
  );
}
