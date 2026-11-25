// About Articula (REBRAND "About", ui-example §10): the mark folding on and on, the lockup, the versions,
// the credits, every attribution with what it does and its licence.
import { AppMark, Dialog, Key } from "@paperboatlab/ui";
import { useEffect, useState } from "react";
import type { OmcClient, OmcStatus } from "../omc/omc.ts";
import { STUDIO_VERSION } from "../version.ts";

const REPO = "https://github.com/paperboatlab/articula";
const BUILT_ON: [string, string, string, string][] = [
  ["OpenModelica (omc)", "compiles and simulates models", "OSMC-PL / GPL-3.0", "https://openmodelica.org"],
  ["Modelica Standard Library", "component models", "BSD-3-Clause", "https://github.com/modelica/ModelicaStandardLibrary"],
  ["three.js", "the 3D view", "MIT", "https://threejs.org"],
  ["CodeMirror, Lezer", "the code editor", "MIT", "https://codemirror.net"],
  ["React", "the interface", "MIT", "https://react.dev"],
  ["@xyflow/react", "the diagram", "MIT", "https://xyflow.com"],
  ["uPlot", "plots", "MIT", "https://github.com/leeoniya/uPlot"],
];
const FONTS: [string, string, string, string][] = [
  ["Geist, Geist Mono", "interface and code", "OFL-1.1", "https://vercel.com/font"],
  ["Funnel Display", "names and titles", "OFL-1.1", "https://fonts.google.com/specimen/Funnel+Display"],
  ["Codicons (classic)", "icons", "CC BY 4.0", "https://github.com/microsoft/vscode-codicons"],
];

function Credits({ title, rows }: { title: string; rows: [string, string, string, string][] }) {
  return (
    <>
      <div className="abg">{title}</div>
      <table className="abtab"><tbody>
        {rows.map(([name, what, licence, url]) => (
          <tr key={name}><td><b>{name}</b></td><td className="mu">{what}</td><td><code>{licence}</code></td>
            <td><a href={url} target="_blank" rel="noreferrer">{url.replace(/^https:\/\//, "")}</a></td></tr>
        ))}
      </tbody></table>
    </>
  );
}

export function AboutModal({ omc, status, onClose }: { omc: OmcClient; status: OmcStatus; onClose: () => void }) {
  // undefined: still asking the server; null: paperboat isn't installed.
  const [paperboat, setPaperboat] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    omc.op<{ paperboat?: string | null }>("about").then((r) => live && setPaperboat(r.paperboat ?? null), () => live && setPaperboat(null));
    return () => { live = false; };
  }, [omc]);
  const omcVersion = /\d+\.\d+\.\d+/.exec(status.version)?.[0];
  const pb = paperboat === undefined ? "Paperboat …" : paperboat ? `Paperboat ${paperboat}` : "Paperboat not installed";
  const info = `omc ${omcVersion ?? "…"} · protocol articula/0`;
  return (
    <Dialog title="About" wide className="about-win" onClose={onClose}>
      <div className="abtop">
        <AppMark app="articula" size={112} loop label="Articula" />
        <div className="abname">
          <span className="wm big"><span className="um">Paperboat</span> <b>Articula</b></span>
          <small>Acausal physical modelling on OpenModelica</small>
          <div className="abver"><b>Version {STUDIO_VERSION}</b><span>{pb}</span><code>{info}</code></div>
          <div className="abkeys">
            <Key size="sm" icon="copy" onClick={() => void navigator.clipboard?.writeText(`Articula ${STUDIO_VERSION} · ${pb} · ${info}`)}>Copy version info</Key>
            <Key size="sm" icon="link-external" onClick={() => window.open(`${REPO}/releases`, "_blank", "noreferrer")}>Check for updates</Key>
            <Key size="sm" icon="link-external" onClick={() => window.open(REPO, "_blank", "noreferrer")}>Source on GitHub</Key>
          </div>
        </div>
      </div>
      <div className="abmade"><b>Made by the Paperboat Lab contributors</b> · free software under{" "}
        <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer">GPL-3.0-only</a> ·{" "}
        <a href={`${REPO}/graphs/contributors`} target="_blank" rel="noreferrer">contributors</a> ·{" "}
        <a href="https://paperboatlab.github.io" target="_blank" rel="noreferrer">docs</a> ·{" "}
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">report an issue</a></div>
      <div>
        <Credits title="Built on" rows={BUILT_ON} />
        <Credits title="Fonts and icons" rows={FONTS} />
      </div>
      <div className="abfoot">© 2026 the Paperboat Lab contributors. Codicons © Microsoft, CC BY 4.0. Each library above keeps its own licence; the full texts ship with the app.</div>
    </Dialog>
  );
}
