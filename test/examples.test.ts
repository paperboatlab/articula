// An example opened in place is read-only (paperboat#75): the store refuses every write before it reaches the
// server (which refuses them too: server/tests), and the Files rail offers none. No DOM: a server render
// hands out the hook's actions, and a fake omc records what would have been sent.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OmcClient, OmcStatus } from "../src/omc/omc.ts";
import { exampleWords, useStudioStore, type Actions } from "../src/store/index.tsx";
import { Rail } from "../src/shell/Rail.tsx";
import type { Workspace } from "../src/shell/workspace.ts";

const STATUS: OmcStatus = { state: "ready", version: "OpenModelica 1.27.0" };

/** The store's actions over a fake omc; `sent` is every op and call that reached it. */
function store(readOnly?: string) {
  const sent: string[] = [];
  const omc = {
    op: (op: string) => (sent.push(op), Promise.resolve({ file: "/ex/New.mo", model: "New", path: "/ex/P", name: "P" })),
    call: (expr: string) => (sent.push(expr), Promise.resolve("true")),
    cancel: () => Promise.resolve(),
  } as unknown as OmcClient;
  let actions: Actions | undefined;
  const Probe = () => ((actions = useStudioStore(omc, STATUS, readOnly).actions), null);
  renderToStaticMarkup(createElement(Probe));
  return { actions: actions!, sent };
}

const writes = (a: Actions): [string, () => Promise<unknown>][] => [
  ["New class", () => a.createClass({ file: "/ex/New.mo", name: "New", kind: "model", within: "" })],
  ["New package", () => a.newPackage("/ex", "P", "")],
  ["Duplicate", () => a.duplicateClass({ file: "/ex/Plant.mo", name: "Plant", newName: "Plant2", within: "" })],
  ["Rename", () => a.renameClass({ file: "/ex/Plant.mo", name: "Plant", newName: "Tank", within: "" })],
  ["Delete", () => a.deleteClass({ file: "/ex/Plant.mo", name: "Plant" })],
  ["Delete package", () => a.deletePackage({ dir: "/ex/Basics", root: "/ex" })],
  ["Move (drag in the rail)", () => a.moveClass({ file: "/ex/Plant.mo", targetDir: "/ex/Basics", within: "Basics" })],
  ["New model", () => a.newModel("Fresh")],
];

test("an example's store refuses every write with the words pointing to Copy, and sends nothing", async () => {
  const why = exampleWords("01 Decay");
  assert.equal(why, "01 Decay is an example: it opens read-only. Copy it to a folder to change it");
  const { actions, sent } = store(why);
  for (const [what, run] of writes(actions)) await assert.rejects(run(), { message: why }, what);
  assert.deepEqual(sent, []);
});

test("a folder that isn't an example takes the same writes (the copy is a normal folder)", async () => {
  const { actions, sent } = store();
  for (const [, run] of writes(actions)) await run();
  assert.deepEqual(sent.filter((s) => !s.includes("(")).slice(0, 8), ["create_class", "new_package", "duplicate_class", "rename_class", "delete_class", "delete_package", "move_class", "open"]);
});

test("an example's Files rail: no drag to move (nor New, Rename, Duplicate, Delete in its menu)", () => {
  const workspace: Workspace = { root: "/ex", entries: [{ name: "Plant", path: "/ex/Plant.mo", kind: "class", classKind: "model", depth: 0 }] } as Workspace;
  const noop = () => undefined;
  const rail = (readOnly: boolean) => renderToStaticMarkup(createElement(Rail, {
    tab: "files", onTab: noop, workspace, git: null, onOpen: noop, onNewClass: noop, onNewPackage: noop, onDuplicate: noop, onRename: noop,
    onDelete: noop, onCopyPath: noop, onMove: noop, readOnly, children: null,
  }));
  assert.match(rail(false), /draggable="true"/);
  assert.doesNotMatch(rail(true), /draggable="true"/);
});
