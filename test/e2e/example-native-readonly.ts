// End to end (paperboat#91): an example's omc lease is read-only on paperboatd's native backend (Landlock), so a
// model whose code writes into the example by absolute path is refused when it runs, with the runtime's words,
// while what it writes by relative path lands in the lease's work folder and an export in Articula's folder.
// The server is started as `paperboat example open` starts it (PAPERBOAT_EXAMPLE=<id>), on a checkout of its own;
// its `git status` stays clean. A paperboatd of the test's own runs on a socket of its own, native only, and is
// shut down at the end: the user's daemon, its sessions and leases are never touched.
//
// Needs Linux 5.19+ (Landlock), paperboat and paperboatd 0.2.0-beta.9 or newer ($PAPERBOAT_BIN and $PAPERBOATD,
// else the ones on PATH), what the omc runtime's native recipe runs (omc on PATH, with the C compiler it builds a
// simulator with, and a perl with JSON::PP), and a built server (npm run build:server):
//
//   PAPERBOATD=… PAPERBOAT_BIN=… node test/e2e/example-native-readonly.ts
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const daemon = process.env.PAPERBOATD || "paperboatd";
const cli = process.env.PAPERBOAT_BIN || "paperboat";
const version = spawnSync(daemon, ["--version"], { encoding: "utf8" }).stdout ?? "";
const [, major, minor, patch, beta] = (version.match(/(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?/) ?? []).map((v) => (v === undefined ? Infinity : Number(v)));
const recent = major !== undefined && (major * 1e6 + minor * 1e3 + patch > 2000 || (major * 1e6 + minor * 1e3 + patch === 2000 && beta >= 9));
assert.ok(recent, `paperboatd 0.2.0-beta.9 or newer (read-only leases), not "${version.trim()}"`);
assert.equal(spawnSync("sh", ["-c", "command -v omc"]).status, 0, "an omc on PATH for the native backend");

const id = "modelica/99-writes";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "articula-ro-")));
const checkout = path.join(tmp, "examples"), ex = path.join(checkout, id);
const escape = path.join(ex, "escaped.txt");
fs.mkdirSync(ex, { recursive: true });
// a paperboat-examples checkout as the CLI finds one (golden.py at its top), with two models whose code writes
fs.writeFileSync(path.join(checkout, "golden.py"), "");
fs.writeFileSync(path.join(ex, "example.toml"), 'app = "articula"\nname = "99 Writes"\ndescription = "A model that writes a file"\n');
const writer = (name: string, file: string) => `model ${name} "Writes ${file} as it starts"
  function put
    input String file;
    output Integer ok;
    external "C" ok = articula_put(file) annotation(Include = "#include <errno.h>
#include <stdio.h>
#include <string.h>
#include \\"ModelicaUtilities.h\\"
static int articula_put(const char* f) {
  FILE* h = fopen(f, \\"w\\");
  if (!h) ModelicaFormatError(\\"cannot write %s: %s\\", f, strerror(errno));
  fputs(\\"written\\\\n\\", h);
  fclose(h);
  return 1;
}");
  end put;
  Real x(start = 1, fixed = true);
  Integer done;
equation
  der(x) = -x;
  when initial() then
    done = put(${JSON.stringify(file)});
  end when;
end ${name};
`;
fs.writeFileSync(path.join(ex, "Escape.mo"), writer("Escape", escape));        // into the example, by absolute path
fs.writeFileSync(path.join(ex, "Scratch.mo"), writer("Scratch", "scratch.txt"));  // relative: the lease's work folder
const git = (...a: string[]) => spawnSync("git", ["-C", checkout, ...a], { encoding: "utf8" });
for (const a of [["init", "-q"], ["add", "-A"], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "examples"]])
  assert.equal(git(...a).status, 0, `git ${a[0]}`);
const status = () => git("status", "--porcelain", "--untracked-files=all", "--ignored").stdout;
assert.equal(status(), "", "the checkout starts clean");

const runtimeDir = path.join(tmp, "run");
const env = {
  ...process.env, PAPERBOAT_HOME: path.join(tmp, "home"), PAPERBOAT_RUNTIME_DIR: runtimeDir, PAPERBOAT_BACKENDS: "native",
  PAPERBOATD: daemon, PAPERBOAT_BIN: cli, PAPERBOAT_EXAMPLES_DIR: checkout, ARTICULA_WORKSPACE: path.join(tmp, "articula"),
  PAPERBOAT_EXAMPLE: id,  // as `paperboat example open` starts the server
};
const listed = JSON.parse(spawnSync(cli, ["example", "list", "--json"], { env, encoding: "utf8" }).stdout) as { id: string; path: string; root?: string }[];
assert.equal(fs.realpathSync(listed.find((x) => x.id === id)!.path), ex, "paperboat lists the example");

// paperboatd's control socket (paperboat/docs/control.md): one request, its reply
const control = (op: string, args: Record<string, unknown> = {}) => new Promise<any>((ok, no) => {
  const s = net.createConnection(path.join(runtimeDir, "control.sock"));
  let buf = "";
  s.on("error", no);
  s.on("connect", () => s.write(JSON.stringify({ id: 1, op, args }) + "\n"));
  s.on("data", (d) => {
    buf += d;
    for (let at; (at = buf.indexOf("\n")) >= 0; buf = buf.slice(at + 1)) {
      const m = JSON.parse(buf.slice(0, at));
      if (m.id === 1) return void (s.end(), m.ok ? ok(m.result) : no(new Error(m.error)));
    }
  });
});

const port = 30700 + Math.floor(Math.random() * 90);
const server = spawn(path.join(root, "server/build/articula-server"), [ex, "--port", String(port)], { env, stdio: ["ignore", "pipe", "inherit"] });
await new Promise<void>((ok) => server.stdout!.on("data", (d: Buffer) => d.toString().includes("articula/0") && ok()));
const ws = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise((ok) => (ws.onopen = ok));
let n = 0;
const waiting = new Map<number, (r: { ok: boolean; result?: any; error?: string }) => void>();
ws.onmessage = (m) => { const r = JSON.parse(String(m.data)); if (r.id && "ok" in r && waiting.has(r.id)) { waiting.get(r.id)!(r); waiting.delete(r.id); } };
const op = (o: Record<string, unknown>) => new Promise<{ ok: boolean; result?: any; error?: string }>((ok) => {
  const msg = { id: ++n, ...o };
  waiting.set(msg.id, ok);
  ws.send(JSON.stringify(msg));
});

try {
  console.log(`server on ${port}, ${ex}; ${version.trim()}, native`);
  const place = (await op({ op: "workspace" })).result;
  assert.equal(place.example?.id, id, "PAPERBOAT_EXAMPLE: the server knows its folder is the example");
  assert.equal(place.example?.name, "99 Writes");

  // the model that writes into the example: refused as it runs, in the runtime's words
  assert.ok((await op({ op: "open", file: path.join(ex, "Escape.mo") })).ok);
  const escaped = await op({ op: "simulate", model: "Escape", stop: 0.1 });
  assert.equal(escaped.ok, false, "a write into the example was let through");
  assert.match(escaped.error ?? "", /Permission denied/, escaped.error);
  assert.match(escaped.error ?? "", /is read-only: it is an example; copy it/, escaped.error);
  assert.ok(!fs.existsSync(escape), "nothing landed in the example");
  console.log(`refused: ${escaped.error}`);

  // the lease: read-only, held by Landlock natively
  const leases = (await control("ps")) as { owner: string; mode: string; backend: string; readonly?: boolean; isolation?: string[]; work: string; project: string }[];
  const lease = leases.find((l) => l.mode === "session" && l.owner === `articula:${ex}`);
  assert.ok(lease, `omc's lease: ${JSON.stringify(leases)}`);
  assert.equal(lease.backend, "native");
  assert.equal(lease.readonly, true, "omc's lease is read-only");
  assert.match((lease.isolation ?? []).join(" "), /project read-only \(Landlock\)/);

  // what it writes by relative path lands in the lease's work folder, and an export in Articula's
  assert.ok((await op({ op: "open", file: path.join(ex, "Scratch.mo") })).ok);
  const scratch = await op({ op: "simulate", model: "Scratch", stop: 0.1 });
  assert.ok(scratch.ok, scratch.error);
  assert.equal(fs.readFileSync(path.join(lease.work, "scratch.txt"), "utf8"), "written\n", "the relative write is in the work folder");
  const flat = await op({ op: "transfer", mode: "export", kind: "flat", model: "Scratch", out: "out/flat.mo" });
  assert.ok(flat.ok, flat.error);
  assert.ok(fs.existsSync(path.join(env.ARTICULA_WORKSPACE, "exports", path.basename(ex), "out", "flat.mo")), "the export is in Articula's folder");
  console.log(`relative write in ${lease.work}, export in ${env.ARTICULA_WORKSPACE}`);

  // the app's own refusal still comes first for its ops
  const saved = await op({ op: "save", model: "Scratch", file: path.join(ex, "Scratch.mo"), content: "model Scratch end Scratch;" });
  assert.match(saved.error ?? "", /is an example: it opens read-only/);

  assert.equal(status(), "", "the example is byte for byte as it was");
  console.log("git status: clean");
} finally {
  ws.close();
  server.kill("SIGTERM");
  await new Promise((ok) => server.once("exit", ok));
  await control("shutdown").catch(() => {});  // the test's own daemon, on its own socket: wait until it is gone
  for (let i = 0; i < 100 && (await control("hello").then(() => true, () => false)); i++) await new Promise((ok) => setTimeout(ok, 100));
  fs.rmSync(tmp, { recursive: true, force: true });
}
