import assert from "node:assert/strict";
import { test } from "node:test";
import { byMenu } from "@paperboatlab/ui";
import { exampleCommands, type Command } from "@paperboatlab/ui";
import { StringStream, type StreamParser } from "@codemirror/language";
import { cpp } from "@codemirror/legacy-modes/mode/clike";
import { commandItems, MENUS } from "../src/shell/menus.ts";

/** What the read-only views colour: each token's text and style, through the editor's own stream parser. */
function tokenize<S>(code: string, parser: StreamParser<S>): { type: string; text: string }[] {
  const state = parser.startState!(2);
  const out: { type: string; text: string }[] = [];
  for (const line of code.split("\n")) {
    const stream = new StringStream(line, 2, 2);
    while (!stream.eol()) {
      const type = parser.token(stream, state);
      if (type) out.push({ type, text: stream.current() });
      stream.start = stream.pos;
    }
  }
  return out;
}
import { defaultExportFolder } from "../src/dock/dock.ts";

test("split: the generated C++ view highlights C++", () => {
  const cppCode = `
#include <iostream>
#include <vector>

namespace squero {
class MyModel : public CausalODE {
public:
  double evaluate(const double* x, double t) override {
    // state derivative
    return -x[0] * 1.5e-3;
  }
};
}
`.trim();

  const allTokens = tokenize(cppCode, cpp);
  const of = (type: string) => allTokens.filter((t) => t.type === type).map((t) => t.text);
  const keywords = of("keyword"), types = of("type"), preproc = of("meta"), comments = of("comment"), numbers = of("number");

  assert.ok(keywords.includes("namespace"), "namespace keyword found");
  assert.ok(keywords.includes("class"), "class keyword found");
  assert.ok(keywords.includes("public"), "public keyword found");
  assert.ok(keywords.includes("const"), "const keyword found");
  assert.ok(keywords.includes("override"), "override keyword found");
  assert.ok(keywords.includes("return"), "return keyword found");

  assert.ok(types.includes("double"), "double type found");
  assert.ok(preproc.some((p) => p.includes("#include")), "preprocessor #include found");
  assert.ok(comments.some((c) => c.includes("state derivative")), "comment found");
  assert.ok(numbers.some((n) => n.startsWith("1.5")), "a number is coloured");
});

test("menu: File menu is the first menu and provides core model lifecycle commands", () => {
  const commands: Command[] = [
    { id: "file.new", label: "New Model", menu: "file", group: "model", shortcut: "Ctrl+N", chord: { key: "n", ctrl: true }, run: () => {} },
    { id: "file.open", label: "Open / Import .mo…", menu: "file", group: "model", shortcut: "Ctrl+O", chord: { key: "o", ctrl: true }, run: () => {} },
    { id: "file.save", label: "Save", menu: "file", group: "save", shortcut: "Ctrl+S", chord: { key: "s", ctrl: true }, run: () => {} },
    { id: "file.save-as", label: "Save As…", menu: "file", group: "save", shortcut: "Ctrl+Shift+S", chord: { key: "s", ctrl: true, shift: true }, run: () => {} },
    { id: "file.load-library", label: "Load Modelica Library…", menu: "file", group: "library", run: () => {} },
    { id: "file.export", label: "Export Paperboat Station", menu: "file", group: "export", shortcut: "Ctrl+E", chord: { key: "e", ctrl: true }, run: () => {} },
    { id: "undo", label: "Undo", menu: "edit", group: "history", shortcut: "Ctrl+Z", run: () => {} },
    { id: "redo", label: "Redo", menu: "edit", group: "history", shortcut: "Ctrl+Shift+Z", run: () => {} },
    { id: "side", label: "Source and Simulate", menu: "view", group: "panes", run: () => {} },
  ];

  const menus = byMenu(commands, MENUS);
  assert.equal(menus[0].id, "file", "File menu is the first menu");
  assert.equal(menus[0].label, "File");

  const fileItemIds = menus[0].items.map((i) => i.id);
  assert.ok(fileItemIds.includes("file.new"), "New Model command registered");
  assert.ok(fileItemIds.includes("file.open"), "Open / Import command registered");
  assert.ok(fileItemIds.includes("file.save"), "Save command registered");
  assert.ok(fileItemIds.includes("file.save-as"), "Save As command registered");
  assert.ok(fileItemIds.includes("file.load-library"), "Load Modelica Library command registered");
  assert.ok(fileItemIds.includes("file.export"), "Export Paperboat Station command registered");

  const saveCmd = menus[0].items.find((i) => i.id === "file.save")!;
  assert.equal(saveCmd.shortcut, "Ctrl+S");
  const openCmd = menus[0].items.find((i) => i.id === "file.open")!;
  assert.equal(openCmd.shortcut, "Ctrl+O");
  const exportCmd = menus[0].items.find((i) => i.id === "file.export")!;
  assert.equal(exportCmd.shortcut, "Ctrl+E");
});

test("export: defaultExportFolder formats model name correctly", () => {
  assert.equal(defaultExportFolder("DCMotor"), "dc-motor-cpp");
  assert.equal(defaultExportFolder("Modelica.Electrical.Analog.Basic.Resistor"), "resistor-cpp");
  assert.equal(defaultExportFolder("CartPole"), "cart-pole-cpp");
});

test("the opening splash says each step the first open waits on (#3)", async () => {
  const { openingWords } = await import("../src/shell/Opening.tsx");
  const up = { state: "checking" as const, version: "OpenModelica 1.27.1~dev", mode: "podman" };
  assert.deepEqual(openingWords({ state: "checking", version: "" }, { step: "omc" }, ""), { say: "Starting OpenModelica", detail: "paperboatd · the omc runtime" });
  assert.deepEqual(openingWords(up, { step: "library" }, ""), { say: "Loading the Modelica Standard Library", detail: "omc 1.27.1 · podman" });
  assert.equal(openingWords(up, { step: "read", model: "P.DCMotor", file: "/w/P/DCMotor.mo" }, "").say, "Reading DCMotor");
  assert.equal(openingWords(up, { step: "file" }, "no class in x.mo").say, "The model didn't open");
});

test("Ctrl K: Open example: <name> for each example, in no menu, Enter opens it (paperboat#72)", () => {
  const opened: string[] = [];
  const examples = [{ id: "modelica/05-double-pendulum", app: "articula", kind: "modelica", name: "05 Double pendulum", description: "", path: "/ex/modelica/05-double-pendulum" }];
  const commands: Command[] = [
    { id: "view.search", label: "Command search…", menu: "view", group: "search", quiet: true, run: () => {} },
    ...exampleCommands(examples, (id) => opened.push(id)),
  ];
  const items = commandItems(commands).filter((i) => i.label.toLowerCase().includes("example"));
  assert.deepEqual(items.map((i) => i.label), ["Open example: 05 Double pendulum"]);
  assert.ok(!MENUS.some((m) => m.id === commands[1].menu), "examples show only in Ctrl K");
  items[0].run();
  assert.deepEqual(opened, ["modelica/05-double-pendulum"]);
});
