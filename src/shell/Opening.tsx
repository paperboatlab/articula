// While omc starts and the first model loads: the kit's Splash, with Articula's words. (The start screen
// is to be redesigned; this only says what is being waited for.)
import { Splash } from "@paperboatlab/ui";
import type { OmcStatus } from "../omc/omc.ts";

export function Opening({ status, stage, error, onRetry }: { status: OmcStatus; stage: string; error: string; onRetry: () => void }) {
  const failed = !!error || status.state === "failed";
  const say = error || (status.state === "failed" ? "The Articula server went away" : status.state === "checking" ? "Starting OpenModelica" : stage || "Opening the model");
  const detail = status.state === "checking" ? "paperboatd · the omc runtime" : status.version;
  return <Splash app="articula" say={say} detail={detail} failed={failed} onRetry={onRetry} />;
}
