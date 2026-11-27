// End to end (paperboat#75): the real server on a real paperboat-examples checkout, driven over articula/0 as
// the page drives it. Every write is refused; check, flatten, simulate and an export run; then the checkout's
// `git status` is clean. Needs paperboat, paperboatd (omc) and a built server:
//
//   node test/e2e/example-readonly.ts <paperboat-examples checkout> [example id, default modelica/03-tank-loop]
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const checkout = path.resolve(process.argv[2] ?? "");
const id = process.argv[3] ?? "modelica/03-tank-loop";
if (!fs.existsSync(path.join(checkout, "golden.py"))) throw new Error("give a paperboat-examples checkout");
const git = (...a: string[]) => spawnSync("git", ["-C", checkout, ...a], { encoding: "utf8" }).stdout;
assert.equal(git("status", "--porcelain", "--untracked-files=all", "--ignored"), "", "the checkout starts clean");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "articula-e2e-"));
// the user's own $PAPERBOAT_HOME: omc's libraries are there (a fresh one would fetch the MSL again)
const env = { ...process.env, PAPERBOAT_EXAMPLES_DIR: checkout, ARTICULA_WORKSPACE: path.join(home, "articula") };
const pbHome = process.env.PAPERBOAT_HOME || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "paperboat");
const listed = JSON.parse(spawnSync("paperboat", ["example", "list", "--json"], { env, encoding: "utf8" }).stdout) as { id: string; path: string }[];
const ex = listed.find((x) => x.id === id)!.path;
const port = 30700 + Math.floor(Math.random() * 90);
const server = spawn(path.join(root, "server/build/articula-server"), [ex, "--port", String(port)], { env, stdio: ["ignore", "pipe", "inherit"] });
await new Promise<void>((ok) => server.stdout!.on("data", (d: Buffer) => d.toString().includes("articula/0") && ok()));

const ws = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise((ok) => (ws.onopen = ok));
let n = 0;
const waiting = new Map<number | string, (r: { ok: boolean; result?: unknown; error?: string }) => void>();
ws.onmessage = (m) => { const r = JSON.parse(String(m.data)); if (r.id && "ok" in r && waiting.has(r.id)) { waiting.get(r.id)!(r); waiting.delete(r.id); } };
// an op's own `id` (example_copy's example) stands for the message's, as it does for the page
const op = (o: Record<string, unknown>) => new Promise<{ ok: boolean; result?: any; error?: string }>((ok) => {
  const msg = { id: ++n, ...o };
  waiting.set(msg.id as number | string, ok);
  ws.send(JSON.stringify(msg));
});

try {
  console.log(`server on ${port}, ${ex}`);
  const place = await op({ op: "workspace" });
  assert.equal(place.result.example.id, id, "the server knows the folder is an example");
  const tree = (await op({ op: "tree" })).result.entries as { path: string; kind: string; classKind?: string }[];
  const file = tree.find((e) => e.kind === "class" && e.classKind === "model")!.path;
  const opened = await op({ op: "open", file });
  assert.ok(opened.ok, opened.error);
  const model = opened.result.model as string;
  console.log(`opened ${model} in ${ex}`);

  // running it: nothing lands in the example
  for (const o of [{ op: "check_model", model }, { op: "instantiate_model", model }, { op: "generate", source: file, model, dry: true },
    { op: "simulate", model, stop: 1 }, { op: "transfer", mode: "export", kind: "flat", model, out: "out/flat.mo" }]) {
    const r = await op(o);
    assert.ok(r.ok, `${o.op}: ${r.error}`);
    console.log(`ran ${o.op}`);
  }
  assert.ok(fs.existsSync(path.join(env.ARTICULA_WORKSPACE, "exports", path.basename(ex), "out", "flat.mo")), "the export went to Articula's folder");

  // every write: refused with the example's words
  const dir = path.dirname(file);
  for (const o of [
    { op: "save", model }, { op: "save", model, file, content: "model X end X;" }, { op: "save", model, file: path.join(dir, "Copy.mo") },
    { op: "create_class", file: path.join(dir, "New.mo"), name: "New", kind: "model", within: "" },
    { op: "new_package", parent: dir, name: "P", within: "" },
    { op: "duplicate_class", file, name: model.split(".").pop(), newName: "Dup", within: "" },
    { op: "rename_class", file, name: model.split(".").pop(), newName: "Ren", within: "" },
    { op: "delete_class", file, name: model.split(".").pop() },
    { op: "move_class", file, targetDir: ex, within: "" },
    { op: "open", file: "Fresh.mo" }, { op: "open", file: path.join(ex, "Drop.mo"), content: "model Drop end Drop;" },
    { op: "generate", source: file, model, out: path.join(ex, "build") },
    { op: "transfer", mode: "export", kind: "flat", model, out: path.join(ex, "flat.mo"), replace: true },
    { op: "omc", expr: `setParameterValue(${model}, x, 1)` },
    { op: "example_copy", id, to: ex },
  ]) {
    const r = await op(o);
    assert.equal(r.ok, false, `${o.op} was let through`);
    assert.match(r.error ?? "", /is an example: it opens read-only/, `${o.op}: ${r.error}`);
  }
  console.log("every write refused");
  const recent = path.join(pbHome, "recent.json");
  assert.ok(!fs.existsSync(recent) || !fs.readFileSync(recent, "utf8").includes(ex), "kept out of recent");
  assert.equal(git("status", "--porcelain", "--untracked-files=all", "--ignored"), "", "the checkout is as it was");
  console.log("git status: clean");
} finally {
  ws.close();
  server.kill("SIGTERM");
  fs.rmSync(home, { recursive: true, force: true });
}
