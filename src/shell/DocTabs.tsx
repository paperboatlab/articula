// The tabs above the stage: one per open model, underlined when shown (REBRAND "Tab menu" rules: middle
// click closes, the last one stays), its dirty dot, and + to open a .mo.
import { Key } from "@paperboatlab/ui";
import type { Doc } from "./workspace.ts";

export function DocTabs({ docs, active, dirty, onSelect, onClose, onOpen }: {
  docs: Doc[];
  active?: string;
  dirty?: boolean;
  onSelect: (doc: Doc) => void;
  onClose: (doc: Doc) => void;
  onOpen: () => void;
}) {
  return (
    <div className="tabs2" role="tablist" aria-label="Open models">
      {docs.map((doc) => {
        const here = doc.file === active;
        return (
          <span key={doc.file} role="tab" aria-selected={here} className={here ? "on" : ""} title={doc.file}
            onClick={() => onSelect(doc)} onAuxClick={(e) => e.button === 1 && docs.length > 1 && onClose(doc)}>
            <span className="ck ck-model">M</span>{doc.name}
            {here && dirty && <i className="dot" title="Not saved" />}
            {docs.length > 1 && <button type="button" className="tx" aria-label={`Close ${doc.name}`} onClick={(e) => { e.stopPropagation(); onClose(doc); }}>×</button>}
          </span>
        );
      })}
      <Key size="sm" kind="quiet" round icon="add" label="Open a .mo file" onClick={onOpen} />
    </div>
  );
}
