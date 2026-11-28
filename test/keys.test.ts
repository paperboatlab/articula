// End to end in a browser (articula#56): the Text view's editor in Vim and Helix. `i` inserts, `:w` saves the
// .mo through Articula's Save, Articula's own shortcuts still go ahead of the mode, and in an example `:w` says it
// is read-only and writes nothing. Needs the built page (npm run build), the built server (npm run build:server),
// omc (paperboat's omc runtime) and a Chrome or Chromium: set CHROME, or have one where Linux keeps it. Skipped
// without any of them.
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import { createRequire as requireFrom } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Browser, Page } from "playwright-core";

const root = process.cwd();   // scripts/test.ts runs the bundle from the checkout
// from the checkout's node_modules at run time: scripts/test.ts bundles this file, and playwright-core won't bundle
const { chromium } = requireFrom(path.join(root, "package.json"))("playwright-core") as typeof import("playwright-core");
// the browser itself, not a wrapper script that outlives close() (Fedora's /usr/bin/chromium-browser)
const chrome = [process.env.CHROME, "/usr/bin/google-chrome", "/usr/lib64/chromium-browser/chromium-browser", "/usr/lib/chromium/chromium", "/usr/bin/chromium"].find((p) => p && fs.existsSync(p));
const serverBin = path.join(root, "server/build/articula-server");
const omc = spawnSync("paperboat", ["runtime", "list"], { encoding: "utf8" }).stdout?.includes("omc@");
const skip = process.platform !== "linux" ? "Linux only"
  : !fs.existsSync(path.join(root, "dist/main.js")) ? "no dist/ (npm run build)"
  : !fs.existsSync(serverBin) ? "no server (npm run build:server)"
  : !omc ? "no omc (paperboat's omc runtime)"
  : !chrome && "no Chrome (set CHROME)";

const MODEL = "model Tank\n  Real h(start = 1);\nequation\n  der(h) = -h;\nend Tank;\n";

test("Vim and Helix in the Text view: i inserts, :w saves the .mo, Articula's keys go first, an example says it is read-only (its banner without ?example= too)", { skip, timeout: 180_000 }, async () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "articula-keys-")));
  const work = path.join(tmp, "work"), conf = path.join(tmp, "config");
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, "Tank.mo"), MODEL);
  // an example where paperboat-examples keeps one (golden.py at the checkout's top): it opens read-only
  const ex = path.join(tmp, "examples", "modelica", "tank");
  fs.mkdirSync(ex, { recursive: true });
  fs.writeFileSync(path.join(tmp, "examples", "golden.py"), "");
  fs.writeFileSync(path.join(ex, "example.toml"), 'app = "articula"\nname = "Tank"\n');
  fs.writeFileSync(path.join(ex, "Tank.mo"), MODEL);
  const env = { ...process.env, XDG_CONFIG_HOME: conf, PAPERBOAT_EXAMPLES_DIR: path.join(tmp, "examples"), ARTICULA_WORKSPACE: path.join(tmp, "articula") };

  const servers: ChildProcess[] = [];
  const start = async (target: string, more: Record<string, string> = {}) => {
    const port = 30700 + Math.floor(Math.random() * 90);
    const server = spawn(serverBin, [target, "--port", String(port), "--app", path.join(root, "dist")], { env: { ...env, ...more }, stdio: ["ignore", "pipe", "inherit"] });
    servers.push(server);
    await new Promise<void>((ok, no) => {
      server.stdout!.on("data", (d: Buffer) => d.toString().includes("articula/0") && ok());
      server.once("exit", (code) => no(new Error(`the server stopped (${code})`)));
    });
    return `http://127.0.0.1:${port}/`;
  };
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ executablePath: chrome });
    const open = async (url: string): Promise<Page> => {   // the model's Text view
      const page = await (await browser!.newContext()).newPage();
      await page.goto(url);
      await page.getByRole("radio", { name: "Text" }).click({ timeout: 60_000 });
      await page.locator(".stage-text .cm-content").waitFor();
      return page;
    };
    const file = path.join(conf, "paperboat", "articula.toml");
    const choose = async (page: Page, keys: string) => {   // Settings › Editor › Keys
      await page.keyboard.press("Control+Comma");
      await page.getByRole("dialog").getByText("Editor", { exact: true }).click();
      await page.getByLabel("Keys").selectOption(keys);
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
      await waitFor(() => fs.existsSync(file) && new RegExp(`^keymap = "${keys}"`, "m").test(fs.readFileSync(file, "utf8")));
    };
    const status = (page: Page) => page.locator(".stage-text .cm-vim-panel").innerText().catch(() => "");
    const first = (page: Page) => page.locator(".stage-text .cm-line").first();
    const saved = () => fs.readFileSync(path.join(work, "Tank.mo"), "utf8");

    const page = await open(await start(path.join(work, "Tank.mo")));
    await choose(page, "vim");
    assert.match(await status(page), /NORMAL/);

    // `i` inserts, Escape is NORMAL again, `:w` writes the .mo
    await first(page).click();
    await page.keyboard.press("0");
    await page.keyboard.type("iy");
    assert.match(await status(page), /INSERT/);
    await page.keyboard.press("Escape");
    assert.match(await status(page), /NORMAL/);
    assert.equal(saved(), MODEL);
    await page.keyboard.type(":w");
    await page.keyboard.press("Enter");
    await waitFor(() => saved() === `y${MODEL}`);

    // Articula's keys go ahead of the mode: Ctrl B (Vim's page up) hides Files and library, and shows it again
    const collapsed = () => page.locator(".side-files").evaluate((e) => e.classList.contains("hidden"));
    assert.equal(await collapsed(), false);
    await first(page).click();
    await page.keyboard.press("Control+b");
    await page.waitForFunction(() => document.querySelector(".side-files")?.classList.contains("hidden"), null, { timeout: 5000 });
    await first(page).click();
    await page.keyboard.press("Control+b");
    await page.waitForFunction(() => !document.querySelector(".side-files")?.classList.contains("hidden"), null, { timeout: 5000 });
    assert.match(await status(page), /NORMAL/);

    // Helix: its `:w` saves too
    await choose(page, "helix");
    await first(page).click();
    await page.keyboard.press("Home");
    await page.keyboard.type("iz");
    await page.keyboard.press("Escape");
    await page.keyboard.type(":w");
    await page.keyboard.press("Enter");
    await waitFor(() => saved() === `zy${MODEL}`);
    await choose(page, "vim");

    // an example: the mode moves about it, `i` changes nothing, `:w` says why it doesn't save
    const three = await open(await start(path.join(ex, "Tank.mo")));
    assert.match(await status(three), /NORMAL/);
    await first(three).click();
    await three.keyboard.press("0");
    await three.keyboard.type("iz");
    await three.keyboard.press("Escape");
    assert.equal(await first(three).innerText(), "model Tank");
    await three.keyboard.type(":w");
    await three.keyboard.press("Enter");
    await three.getByText("Not saved: the example is read-only").waitFor({ timeout: 5000 });
    assert.equal(fs.readFileSync(path.join(ex, "Tank.mo"), "utf8"), MODEL);

    // started as `paperboat example open` starts it (PAPERBOAT_EXAMPLE, paperboat#91) on a folder no marker names,
    // in a window without ?example=: the banner and its Copy show all the same, and `:w` doesn't save
    const elsewhere = path.join(tmp, "opened-here");
    fs.mkdirSync(elsewhere);
    fs.writeFileSync(path.join(elsewhere, "Tank.mo"), MODEL);
    const four = await open(await start(path.join(elsewhere, "Tank.mo"), { PAPERBOAT_EXAMPLE: "modelica/tank" }));
    assert.equal(new URL(four.url()).search, "");
    await four.getByRole("note", { name: "Tank: an example" }).waitFor({ timeout: 10_000 });
    await four.getByRole("button", { name: /Copy to a folder/ }).waitFor();
    await first(four).click();
    await four.keyboard.type(":w");
    await four.keyboard.press("Enter");
    await four.getByText("Not saved: the example is read-only").waitFor({ timeout: 5000 });
    assert.equal(fs.readFileSync(path.join(elsewhere, "Tank.mo"), "utf8"), MODEL);
  } finally {
    await browser?.close();
    for (const s of servers) s.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

async function waitFor(ok: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}
