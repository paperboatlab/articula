// The stage's Text view: the model's whole .mo, editable. It reads the file (not omc's list(),
// which is the class body) so `within` and annotations are exactly what Save writes back.
// It is the shared Studio editor (@paperboat/shared/editor) with Modelica, editable but in an example. A
// message selects its line. The App routes Save and document switches through the
// registered handle. Its keys: Save (Mod-s, which Vim's and Helix's `:w` runs) and the App's, ahead of the mode.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { Key } from "@paperboatlab/ui";
import { Editor as CodeEditor, type EditorSettings } from "@paperboatlab/ui/editor";
import { modelica } from "@paperboatlab/ui/editor";
import type { StudioModel } from "../model/types.ts";
import type { Actions } from "../store/index.tsx";

export type TextEditorHandle = { dirty: boolean; save: () => Promise<void> };

// The kit makes a read-only editor unfocusable; an example's takes the focus while its state stays read-only, so
// Vim's and Helix's keys move about it and `:w` reaches Save, which says why not (the kit's Editor puts `extra`
// ahead of its read-only: the first editable value wins).
const FOCUSABLE = EditorView.editable.of(true);

export function TextStage({
  model,
  actions,
  line,
  theme,
  settings,
  base,
  readOnly,
  keys,
  onRefused,
  onEditor,
}: {
  model: StudioModel;
  actions: Actions;
  line?: number;
  /** The app's shown theme, for the editor's "ui" setting. */
  theme: "light" | "dark";
  /** The editor settings (Settings › Editor; the App keeps them in articula.toml). */
  settings: EditorSettings;
  /** HEAD's copy of the file for the git gutter; null when untracked or outside a repository. */
  base?: string | null;
  /** An example opened in place: why the text takes no edit (it reads, selects and copies). */
  readOnly?: string;
  /** The App's keys, ahead of Vim's or Helix's mode; read at mount. */
  keys?: readonly KeyBinding[];
  /** Save in an example (Ctrl S, `:w`): told why it doesn't save. */
  onRefused?: (why: string) => void;
  onEditor?: (handle: TextEditorHandle | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<EditorView | null>(null);
  const read = useRef(actions.fileText);
  read.current = actions.fileText;
  const write = useRef(actions.saveText);
  write.current = actions.saveText;
  const editorCb = useRef(onEditor);
  editorCb.current = onEditor;
  const refused = useRef(onRefused);
  refused.current = onRefused;

  useEffect(() => {
    let live = true;
    setText(null);
    setError("");
    read.current().then(
      (value) => {
        if (!live) return;
        setText(value);
        setSaved(value);
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [model.file]);

  const dirty = text !== null && text !== saved;
  const save = useCallback(async () => {
    if (readOnly) return void refused.current?.(readOnly);
    if (text === null || text === saved || busy) return;
    setBusy(true);
    setError("");
    try {
      await write.current(text);
      setSaved(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [text, saved, busy, readOnly]);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    editorCb.current?.({ dirty, save: () => saveRef.current() });
  }, [dirty]);
  useEffect(
    () => () => {
      editorCb.current?.(null);
    },
    [],
  );

  // Ctrl+S saves the buffer, not the stale omc model: capture it before the app's shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Mod-s is what Vim's and Helix's `:w` runs (Ctrl S itself is the window's, above)
  const editorKeys = useMemo<KeyBinding[]>(() => [
    { key: "Mod-s", preventDefault: true, run: () => (void saveRef.current(), true) },
    ...(keys ?? []),
  ], [keys]);

  // A message's line: select it and bring it to the middle.
  useEffect(() => {
    if (!view || !line) return;
    const doc = view.state.doc;
    const at = doc.line(Math.min(Math.max(line, 1), doc.lines));
    view.dispatch({ selection: EditorSelection.range(at.from, at.to), effects: EditorView.scrollIntoView(at.from, { y: "center" }) });
    view.focus();
  }, [line, view]);

  const name = model.file ? model.file.split(/[\\/]/).pop() : `${model.name}.mo`;
  return (
    <section className="stage-text" aria-label={`${model.name} text`}>
      <header className="code-head">
        <b>{name}</b>
        <span className="lbl">· {model.name}</span>
        <span className="spacer" />
        {dirty && <span className="lbl">unsaved</span>}
        {text !== null && (
          <Key size="sm" kind="quiet" icon="copy" onClick={() => void navigator.clipboard?.writeText(text)}>Copy</Key>
        )}
        {readOnly ? <span className="lbl" title={readOnly}>read-only</span>
          : <Key size="sm" kind="primary" busy={busy} disabled={!dirty || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Key>}
      </header>
      <div className="code-editor">
        {text === null ? (
          <p className="code-reading">{error || "reading…"}</p>
        ) : (
          <CodeEditor
            key={model.file}
            value={text}
            onChange={setText}
            readOnly={!!readOnly}
            keys={editorKeys}
            extra={readOnly ? FOCUSABLE : undefined}
            settings={settings}
            appTheme={theme}
            ariaLabel="Modelica source editor"
            language={modelica}
            base={base}
            onView={setView}
          />
        )}
      </div>
      {error && (
        <p className="studio-var-error code-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
