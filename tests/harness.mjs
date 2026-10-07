// Test harness: starts a throwaway headless Chrome and drives it over the DevTools protocol.
// Two modes:
// - offline (default): Migalhas is installed like "Load unpacked" and web pages are served locally,
//   so no website is contacted. Uses --remote-debugging-pipe, which loading an extension requires.
// - real sites: opens real websites and injects the content scripts the way Chrome does for the
//   installed extension. Chrome runs without administrator rights and is reached through a port.
// Both use a fresh temporary profile, so real profiles and cookies are never touched.
// Needs Node.js 22+ (built-in WebSocket) and Chrome; no npm packages.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(PROJECT_DIR, "tests", "output");
const COMMAND_TIMEOUT_MS = 30000;

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sameSet = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...b].sort());

// Polls fn until it returns a truthy value, then returns that value.
export async function waitFor(fn, label, timeoutMs = 10000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

export function createReport() {
  const checks = [];
  return {
    check(label, ok, detail = "") {
      checks.push({ label, ok: Boolean(ok), detail });
    },
    // Prints every check and exits with code 1 if any failed. showConsole picks the console lines to print.
    finish(browser, { showConsole = () => true } = {}) {
      for (const { label, ok, detail } of checks) {
        console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
      }
      const lines = browser?.consoleLines.filter(showConsole) ?? [];
      if (lines.length > 0) {
        console.log(`\nConsole:\n${lines.map((line) => `  ${line}`).join("\n")}`);
      }
      const failed = checks.filter((c) => !c.ok).length;
      console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
      if (failed && browser?.stderr) {
        console.log(`\nChrome stderr (last lines):\n${browser.stderr.split("\n").slice(-15).join("\n")}`);
      }
      process.exit(failed ? 1 : 0);
    },
  };
}

export async function launchBrowser({ realSites = false } = {}) {
  const chromePath = CHROME_PATHS.find((candidate) => candidate && existsSync(candidate));
  if (!chromePath) {
    throw new Error("Chrome not found. Set the CHROME_PATH environment variable to the Chrome executable.");
  }
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "migalhas-test-"));
  const commonArgs = ["--headless", `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--disable-sync"];
  return realSites ? launchWithPort(chromePath, profileDir, commonArgs) : launchWithPipe(chromePath, profileDir, commonArgs);
}

function launchWithPipe(chromePath, profileDir, commonArgs) {
  const proc = spawn(
    chromePath,
    [
      ...commonArgs,
      // On Windows, Chrome refuses to run as administrator and relaunches itself in a new process that
      // loses the pipe. This keeps it in this process, which is safe here because pages are served offline.
      "--do-not-de-elevate",
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );
  // The pipe carries NUL-separated JSON: fd 3 to Chrome, fd 4 from Chrome.
  const cdp = new Cdp((text) => proc.stdio[3].write(`${text}\0`));
  let buffer = "";
  proc.stdio[4].setEncoding("utf8");
  proc.stdio[4].on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) !== -1) {
      cdp.receive(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
    }
  });
  const browser = new Browser(cdp, profileDir, { proc });
  proc.stderr.on("data", (chunk) => (browser.stderr += chunk));
  return browser;
}

// Without --do-not-de-elevate, Chrome drops administrator rights (relaunching itself if needed) and
// writes the debugging port it picked to DevToolsActivePort in the profile folder.
async function launchWithPort(chromePath, profileDir, commonArgs) {
  spawn(chromePath, [...commonArgs, "--remote-debugging-port=0", "about:blank"], { stdio: "ignore", detached: true }).unref();
  const portFile = path.join(profileDir, "DevToolsActivePort");
  const [port, browserPath] = await waitFor(
    () => {
      const lines = existsSync(portFile) ? readFileSync(portFile, "utf8").trim().split(/\r?\n/) : [];
      return lines.length >= 2 ? lines : null;
    },
    "Chrome's debugging port",
    20000,
  );
  const socket = new WebSocket(`ws://127.0.0.1:${port}${browserPath}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome")), { once: true });
  });
  const cdp = new Cdp((text) => socket.send(text));
  socket.addEventListener("message", (event) => cdp.receive(event.data));
  return new Browser(cdp, profileDir, { disconnect: () => socket.close() });
}

// Minimal DevTools protocol client; the transport (pipe or WebSocket) is given by write/receive.
class Cdp {
  constructor(write) {
    this.write = write;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
  }

  receive(text) {
    const message = JSON.parse(text);
    const waiting = this.pending.get(message.id);
    if (!waiting) {
      this.listeners.forEach((listener) => listener(message));
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.error) {
      waiting.reject(new Error(`${waiting.method}: ${message.error.message} ${message.error.data ?? ""}`.trim()));
    } else {
      waiting.resolve(message.result);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} got no reply from Chrome`));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { method, resolve, reject, timer });
    });
  }
}

class Browser {
  constructor(cdp, profileDir, { proc = null, disconnect = () => {} } = {}) {
    this.cdp = cdp;
    this.profileDir = profileDir;
    this.proc = proc;
    this.disconnect = disconnect;
    this.sessionNames = new Map();
    this.targetIds = new Map();
    this.consoleLines = [];
    this.errors = [];
    this.stderr = "";
    this.cdp.listeners.push((message) => this.recordConsole(message));
  }

  recordConsole(message) {
    const where = this.sessionNames.get(message.sessionId) ?? "browser";
    if (message.method === "Runtime.consoleAPICalled") {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
      this.consoleLines.push(`[${where}] ${message.params.type}: ${text}`);
      if (message.params.type === "error") {
        this.errors.push(`[${where}] ${text}`);
      }
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      this.errors.push(`[${where}] ${details.exception?.description ?? details.text}`);
    }
  }

  send(method, params, sessionId) {
    return this.cdp.send(method, params, sessionId);
  }

  // Installs the extension like "Load unpacked" and returns its id (offline mode only).
  async loadExtension(dir = PROJECT_DIR) {
    await this.send("Target.setDiscoverTargets", { discover: true });
    const { id } = await this.send("Extensions.loadUnpacked", { path: dir });
    return id;
  }

  async attachServiceWorker(extensionId) {
    const worker = await waitFor(async () => {
      const { targetInfos } = await this.send("Target.getTargets");
      return targetInfos.find(
        (target) => target.type === "service_worker" && target.url.startsWith(`chrome-extension://${extensionId}/`),
      );
    }, "the extension's service worker");
    return this.attach(worker.targetId, "service worker");
  }

  async attach(targetId, name) {
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    this.sessionNames.set(sessionId, name);
    this.targetIds.set(sessionId, targetId);
    await this.send("Runtime.enable", {}, sessionId);
    return sessionId;
  }

  async evaluate(sessionId, expression) {
    const { result, exceptionDetails } = await this.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  }

  // Opens a page in a new tab, attached before it loads so no console message is missed.
  async openPage(url, name) {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const session = await this.attach(targetId, name);
    await this.send("Page.enable", {}, session);
    await this.send("Page.navigate", { url }, session);
    return session;
  }

  // Opens a tab on a web address without touching the network: every request gets the given HTML.
  async openOfflineTab(url, html = "<title>Offline test page</title>") {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const session = await this.attach(targetId, `tab ${url}`);
    this.cdp.listeners.push((message) => {
      if (message.sessionId === session && message.method === "Fetch.requestPaused") {
        this.send(
          "Fetch.fulfillRequest",
          {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
            body: Buffer.from(html).toString("base64"),
          },
          session,
        ).catch(() => {
          // The tab was closed while a request (e.g. the favicon) was still pending: nothing to answer.
        });
      }
    });
    await this.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, session);
    await this.send("Page.navigate", { url }, session);
    return session;
  }

  async closeTab(session) {
    await this.send("Target.closeTarget", { targetId: this.targetIds.get(session) });
  }

  // Opens a real website like a normal Chrome would: no "Headless" in the user agent, Portuguese first.
  async openRealPage(url) {
    const { userAgent } = await this.send("Browser.getVersion");
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const session = await this.attach(targetId, `page ${url}`);
    await this.send(
      "Emulation.setUserAgentOverride",
      { userAgent: userAgent.replace("HeadlessChrome", "Chrome"), acceptLanguage: "pt-PT,pt;q=0.9" },
      session,
    );
    await this.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, session);
    await this.send("Page.enable", {}, session);
    await this.send("Page.navigate", { url }, session);
    await waitFor(
      () => this.evaluate(session, `location.href !== "about:blank" && document.readyState === "complete"`),
      `${url} to load`,
      30000,
    );
    return session;
  }

  // Runs the content scripts listed in manifest.json in an isolated world, like Chrome does for the
  // installed extension. Used on real sites, where the extension itself can't be loaded.
  async injectContentScripts(session) {
    const manifest = JSON.parse(readFileSync(path.join(PROJECT_DIR, "manifest.json"), "utf8"));
    const files = manifest.content_scripts.flatMap((entry) => entry.js);
    const { frameTree } = await this.send("Page.getFrameTree", {}, session);
    const { executionContextId } = await this.send(
      "Page.createIsolatedWorld",
      { frameId: frameTree.frame.id, worldName: "Migalhas content scripts" },
      session,
    );
    for (const file of files) {
      const source = `${readFileSync(path.join(PROJECT_DIR, file), "utf8")}\n//# sourceURL=migalhas/${file}`;
      const { exceptionDetails } = await this.send("Runtime.evaluate", { expression: source, contextId: executionContextId }, session);
      if (exceptionDetails) {
        throw new Error(`${file}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      }
    }
  }

  async setCookies(domains) {
    const expires = Math.floor(Date.now() / 1000) + 86400;
    await this.send("Storage.setCookies", {
      cookies: domains.map((domain) => ({ name: "test", value: "1", domain, path: "/", secure: true, expires })),
    });
  }

  async cookieDomains() {
    const { cookies } = await this.send("Storage.getCookies");
    return [...new Set(cookies.map((cookie) => cookie.domain.replace(/^\./, "")))].sort();
  }

  // Saves a PNG of the page in tests/output/ (ignored by Git).
  async screenshot(session, fileName, colorScheme = "light") {
    await this.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 760, deviceScaleFactor: 1, mobile: false }, session);
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: colorScheme }] }, session);
    await sleep(300);
    const { data } = await this.send("Page.captureScreenshot", { format: "png" }, session);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(path.join(OUTPUT_DIR, fileName), Buffer.from(data, "base64"));
  }

  async close() {
    await Promise.race([this.send("Browser.close").catch(() => {}), sleep(5000)]);
    this.proc?.kill();
    this.disconnect();
    await this.removeProfile();
  }

  // In real-sites mode Chrome isn't our child process, so it may still be closing: retry for a while.
  async removeProfile() {
    let lastError;
    for (let attempt = 0; attempt < 15; attempt++) {
      await sleep(1000);
      try {
        rmSync(this.profileDir, { recursive: true, force: true });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    console.warn(`Could not remove the temporary profile ${this.profileDir}: ${lastError.message}`);
  }
}
