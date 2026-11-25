// The runtimes key (REBRAND "Runtimes key": one key, never a row of pills): a peek at the workspace's
// omc. omc comes from paperboatd (the omc runtime's session mode); its libraries are the runtime's
// packages, in the workspace's package volume.
import { Icon, Key, Spinner, useDismiss } from "@paperboatlab/ui";
import { useRef, useState } from "react";
import type { OmcStatus } from "../omc/omc.ts";

export function OmcKey({ status, running, onLibraries }: { status: OmcStatus; running: boolean; onLibraries: () => void }) {
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null), key = useRef<HTMLButtonElement>(null);
  useDismiss(pop, () => setOpen(false), { enabled: open, triggerRef: key });
  const version = /\d+\.\d+\.\d+/.exec(status.version)?.[0];
  const live = running || status.state === "checking";
  const failed = status.state === "failed";
  return (
    <span className="popw">
      <button ref={key} type="button" className={`key round rtk${live ? " live" : ""}${failed ? " bad" : ""}`} aria-expanded={open} aria-haspopup="dialog"
        title={`Runtimes: OpenModelica ${status.state}`} onClick={() => setOpen(!open)}>
        <Icon name="a-runtimes" />{failed ? <b className="badge bad">!</b> : status.state === "ready" ? <b className="badge">1</b> : null}
      </button>
      {open && (
        <div ref={pop} className="popover rtpop" role="dialog" aria-label="Runtimes">
          <div className="poph"><b>Runtimes</b><span>this workspace · paperboat-runtime/0</span></div>
          <div className={`rt${live ? " run" : ""}${failed ? " off" : ""}`}>
            <span className="rlg">mo</span>
            <div>
              <b>OpenModelica{version ? ` ${version}` : ""}</b>
              <small>session{status.mode ? ` · ${status.mode}` : ""} · omc</small>
              {running ? <p className="now"><Spinner size={12} />simulating</p>
                : status.state === "checking" ? <p className="now"><Spinner size={12} />working</p>
                : failed ? <p>failed: the next call starts a new session</p> : <p>ready</p>}
            </div>
            <div />
          </div>
          <div className="pfoot"><span>Libraries live with this workspace.</span><Key size="sm" kind="quiet" icon="package" onClick={() => { setOpen(false); onLibraries(); }}>Libraries…</Key></div>
        </div>
      )}
    </span>
  );
}
