// The menu bar (REBRAND "Menu bar"): File, Edit, View, the app's own menu (Model), Help.
import type { CommandMenu } from "@paperboatlab/ui";

export const MENUS: CommandMenu[] = [
  { id: "file", label: "File" },
  { id: "edit", label: "Edit" },
  { id: "view", label: "View" },
  { id: "model", label: "Model" },
  { id: "help", label: "Help" },
];
