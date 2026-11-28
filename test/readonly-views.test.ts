// An example's popover and icon editor (articula#57's gap): their fields show, read-only, and their actions are greyed
// with the example's words; a normal model's are live.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { StudioContext, type StudioApi } from "../src/model/types.ts";
import { ComponentPopover } from "../src/popover/index.tsx";
import { IconView } from "../src/icon/IconView.tsx";
import { PaperboatBlock } from "../src/sheet/PaperboatBlock.tsx";

const WORDS = "03 Tank loop is an example: it opens read-only. Copy it to a folder to change it";
const ICON = { w: 40, h: 40, g: [{ t: "rect", x: 10, y: 10, w: 20, h: 20 }], ports: [{ id: "p", side: "left", at: 50 }] };
const api = (readOnly?: string) => ({
  readOnly,
  selection: [],
  status: { state: "ready" },
  model: {
    name: "Basics.Loop", entries: [{ name: "p", kind: "connector", class: "FluidPort" }], params: [], connectors: {}, connections: [],
    icon: ICON,
    components: [{ name: "tank", class: "Basics.Tank", params: { area: "1.0" }, defaults: { area: "1" }, placement: { x: 0, y: 0, rotation: 0 }, ports: [] }],
  },
}) as unknown as StudioApi;
const render = (view: () => unknown, readOnly?: string) =>
  renderToStaticMarkup(createElement(StudioContext.Provider, { value: api(readOnly) }, createElement(ReactFlowProvider, null, createElement(view as never))));
/** Every opening tag in `html` that has all of `has`. */
const tags = (html: string, ...has: string[]) => (html.match(/<[a-z]+\b[^>]*>/g) ?? []).filter((t) => has.every((h) => t.includes(h)));

test("an example's popover: the values read-only, Bind greyed with the example's words", () => {
  const view = () => createElement(ComponentPopover, { component: "tank", onClose: () => undefined });
  const live = render(view), example = render(view, WORDS);
  assert.deepEqual(tags(live, "readOnly"), []);
  assert.equal(tags(example, 'aria-label="tank.area"', "readOnly", "read-only").length, 1);
  assert.equal(tags(example, "<button", "disabled", `title="${WORDS}"`).length, 1, "Bind (=) greyed, saying why");
});

test("an example's icon editor: only Select, every field read-only, nothing to add or save", () => {
  const live = render(IconView), example = render(IconView, WORDS);
  assert.deepEqual(tags(live, "icon-tool", "disabled"), []);
  assert.ok(tags(example, "icon-tool", "disabled").length >= 3, "every drawing tool but Select");
  assert.deepEqual(tags(example, 'aria-label="select"', "disabled"), []);
  assert.equal(tags(example, 'aria-label="Size"', 'aria-readonly="true"').length, 1, "the plate's size shows but doesn't change");
  assert.equal(tags(example, "<select", "read-only", "disabled").length, 1);
  assert.equal(tags(example, 'aria-label="p at"', "readOnly").length, 1);
  assert.equal(tags(example, 'aria-label="New connector name"', "readOnly").length, 1);
  assert.equal(tags(example, 'aria-label="Add the connector', "disabled").length, 1);
  assert.deepEqual(tags(live, 'aria-label="New connector name"', "readOnly"), []);
});

test("an example's Paperboat block: the pins show, read-only", () => {
  const example = render(PaperboatBlock, WORDS);
  assert.equal(tags(example, "<select", "read-only", "disabled").length, 1);
  assert.equal(tags(example, "studio-look-at-input read-only", "readOnly").length, 1);
  assert.deepEqual(tags(render(PaperboatBlock), "readOnly"), []);
});
