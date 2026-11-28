// A compact side picker for a pin: four words in a select, not a wide switch row.
import { type IconPort } from "@paperboatlab/ui/canvas";
import { SIDE_OPTIONS } from "./look.ts";

/** `readOnly` (an example): why it can't change; the select is disabled, drawn as read-only (a select has no readonly). */
export function SideSelect({ value, onChange, label, readOnly }: { value: IconPort["side"]; onChange: (side: IconPort["side"]) => void; label: string; readOnly?: string }) {
  return (
    <select className={`icon-side-select${readOnly ? " read-only" : ""}`} aria-label={label} disabled={!!readOnly} title={readOnly} value={value} onChange={(e) => onChange(e.target.value as IconPort["side"])}>
      {SIDE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
