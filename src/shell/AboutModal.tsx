// About Articula (REBRAND "About"): the mark, the versions, what it talks to, the attributions.
import { AppMark, Dialog, Key } from "@paperboatlab/ui";
import { useEffect, useState } from "react";
import type { OmcClient, OmcStatus } from "../omc/omc.ts";
import { STUDIO_VERSION } from "../version.ts";

export function AboutModal({ omc, status, onClose }: { omc: OmcClient; status: OmcStatus; onClose: () => void }) {
  // undefined: still asking the server; null: paperboat isn't installed.
  const [paperboat, setPaperboat] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    omc.op<{ paperboat?: string | null }>("about").then((r) => live && setPaperboat(r.paperboat ?? null), () => live && setPaperboat(null));
    return () => { live = false; };
  }, [omc]);
  const omcVersion = /\d+\.\d+\.\d+/.exec(status.version)?.[0] ?? "";
  return (
    <Dialog title="About Articula" onClose={onClose} actions={<Key onClick={onClose}>Close</Key>}>
      <div className="about">
        <AppMark app="articula" size={64} idle label="" />
        <dl>
          <dt>Articula</dt><dd>{STUDIO_VERSION} · acausal modelling, part of Paperboat</dd>
          <dt>Paperboat</dt><dd>{paperboat === undefined ? "checking…" : paperboat ?? "not installed"}</dd>
          <dt>Runtime</dt><dd>{omcVersion ? `OpenModelica ${omcVersion} · ${status.mode || "…"} · paperboat-runtime/0` : "OpenModelica, from paperboatd"}</dd>
          <dt>Built on</dt><dd><a href="https://openmodelica.org" target="_blank" rel="noreferrer">OpenModelica</a> (OSMC-PL / GPL-3.0), the <a href="https://github.com/modelica/ModelicaStandardLibrary" target="_blank" rel="noreferrer">Modelica Standard Library</a> (BSD-3-Clause), React, React Flow, three.js, uPlot, CodeMirror</dd>
          <dt>Licence</dt><dd>GNU GPL 3.0 · <a href="https://github.com/paperboatlab/articula" target="_blank" rel="noreferrer">github.com/paperboatlab/articula</a></dd>
        </dl>
      </div>
    </Dialog>
  );
}
