// The menu bar (REBRAND "Menu bar"): File, Edit, View, the app's own menu (Model), Help.
import type { Command, CommandMenu, SearchItem } from "@paperboatlab/ui";

export const MENUS: CommandMenu[] = [
  { id: "file", label: "File" },
  { id: "edit", label: "Edit" },
  { id: "view", label: "View" },
  { id: "model", label: "Model" },
  { id: "help", label: "Help" },
];

/** Ctrl K's Commands: every command but the quiet ones, the examples' (menu "examples", in no menu) among them. */
export const commandItems = (commands: Command[]): SearchItem[] =>
  commands.filter((c) => !c.quiet).map((c) => ({ id: c.id, label: c.label, group: "Commands", shortcut: c.shortcut, disabled: c.enabled === false, why: c.why, run: c.run }));
