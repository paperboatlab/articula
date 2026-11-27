// The wait while omc starts and the first model opens (REBRAND "Splash", agent-docs/rebrand/apps/splash):
// the kit's Splash, one line per step the open waits on (omc's session, the MSL, the file, reading the
// model) and its specifics in mono; it finishes the unfold before the window shows (`onReady`). Failed:
// Retry and Show log (omc's messages so far, under the splash); slow: the kit's "Taking longer than usual".
import { useState } from "react";
import { Splash } from "@paperboatlab/ui";
import type { OmcLog, OmcStatus } from "../omc/omc.ts";
import type { OpenStep } from "../store/index.tsx";

/** The splash's two lines for a step: what is happening, then the specifics. */
export function openingWords(status: OmcStatus, stage: OpenStep, error: string): { say: string; detail: string } {
  const version = /\d+\.\d+\.\d+/.exec(status.version)?.[0];
  const omc = version ? `omc ${version}${status.mode ? ` · ${status.mode}` : ""}` : "paperboatd · the omc runtime";
  if (error) return { say: "The model didn't open", detail: error };
  if (status.state === "failed") return { say: "OpenModelica didn't start", detail: "the Articula server went away" };
  if (stage.step === "library") return { say: "Loading the Modelica Standard Library", detail: omc };
  if (stage.step === "file") return { say: "Opening the model", detail: omc };
  if (stage.step === "read") return { say: `Reading ${stage.model.split(".").pop()}`, detail: `${stage.file.split("/").pop()} · parts, icons and wires` };
  return { say: "Starting OpenModelica", detail: omc };
}

export function Opening({ status, stage, error, ready, onReady, onRetry, log }: {
  status: OmcStatus; stage: OpenStep; error: string; ready: boolean; onReady: () => void; onRetry: () => void;
  /** omc's messages so far, for Show log. */
  log: () => OmcLog[];
}) {
  const [shown, setShown] = useState<OmcLog[] | null>(null);
  const failed = !!error || status.state === "failed";
  const { say, detail } = openingWords(status, stage, error);
  return (
    <div className="opening">
      <Splash app="articula" say={say} detail={detail} failed={failed} ready={ready && !failed} onReady={onReady} onRetry={onRetry}
        onLog={() => setShown((s) => (s ? null : log()))} />
      {shown && (
        <pre className="opening-log" aria-label="omc's messages">
          {shown.length ? shown.map((m, i) => <span key={i} className={m.level}>{m.text}{"\n"}</span>) : "omc has said nothing yet."}
        </pre>
      )}
    </div>
  );
}
