// The Studio's small dialogs, each the shared Modal (Esc, a press outside, focus back to the opener).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog, Key } from "@paperboatlab/ui";

export function PromptModal({
  title,
  label,
  value: initialValue = "",
  placeholder = "",
  confirmLabel = "OK",
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (val: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!val.trim()) return;
    void onConfirm(val.trim());
    onClose();
  };

  return (
    <Dialog title={title} onClose={onClose}
      actions={<><Key kind="primary" disabled={!val.trim()} onClick={() => handleSubmit()}>{confirmLabel}</Key><Key onClick={onClose}>Cancel</Key></>}>
      <form onSubmit={handleSubmit}>
        <label className="well ask">
          <input ref={inputRef} value={val} placeholder={placeholder} aria-label={label} onChange={(e) => setVal(e.target.value)} />
          <em>{label}</em>
        </label>
      </form>
    </Dialog>
  );
}

export function ConfirmModal({
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}
      actions={<><Key kind="danger" onClick={() => { void onConfirm(); onClose(); }}>{confirmLabel}</Key><Key onClick={onClose}>Cancel</Key></>}>
      <p>{body}</p>
    </Dialog>
  );
}

const COMMON_LIBRARIES = [
  { name: "Modelica", desc: "Modelica Standard Library (MSL)" },
  { name: "Modelica_Synchronous", desc: "Synchronous control systems library" },
  { name: "ModelicaServices", desc: "Standard services for MSL" },
  { name: "Complex", desc: "Complex number math library" },
  { name: "Buildings", desc: "LBNL Modelica Buildings library" },
];

export function LibraryModal({
  onLoad,
  onClose,
}: {
  onLoad: (lib: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!custom.trim()) return;
    void onLoad(custom.trim());
    onClose();
  };

  return (
    <Dialog title="Load a Modelica library" onClose={onClose}
      actions={<><Key kind="primary" disabled={!custom.trim()} onClick={() => handleSubmit()}>Load</Key><Key onClick={onClose}>Cancel</Key></>}>
      <div className="lib-quick-list">
        {COMMON_LIBRARIES.map((l) => (
          <button key={l.name} type="button" className="lib-quick-item" onClick={() => { void onLoad(l.name); onClose(); }}>
            <b>{l.name}</b><span className="muted">{l.desc}</span>
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <label className="well ask">
          <input ref={inputRef} value={custom} placeholder="MyLib, or a package.mo in the workspace" aria-label="Another library" onChange={(e) => setCustom(e.target.value)} />
          <em>Another library</em>
        </label>
      </form>
    </Dialog>
  );
}
