// Test harness: starts a throwaway headless Chrome with Migalhas loaded and drives it over the
// DevTools protocol. It uses a fresh temporary profile and serves web pages offline, so real
// profiles, cookies and websites are never touched. Needs Node.js 18+ and Chrome; no npm packages.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(PROJECT_DIR, "tests", "output");

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
    // Prints every check and exits with code 1 if any failed.
    finish(browser) {
      for (const { label, ok, detail } of checks) {
        console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
      }
      if (browser?.consoleLines.length) {
        console.log(`\nConsole:\n${browser.consoleLines.map((line) => `  ${line}`).join("\n")}`);
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

export async function launchBrowser() {
  const chromePath = CHROME_PATHS.find((candidate) => candidate && existsSync(candidate));
  if (!chromePath) {
    throw new Error("Chrome not found. Set the CHROME_PATH environment variable to the Chrome executable.");
  }
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "migalhas-test-"));
  const proc = spawn(
    chromePath,
    [
      "--headless",
      // On Windows, Chrome refuses to run as administrator and relaunches itself in a new process
      // that loses the debugging pipe. This keeps it in this process; web pages are served offline.
      "--do-not-de-elevate",
      `--user-data-dir=${profileDir}`,
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );
  return new Browser(proc, profileDir);
}

// Minimal DevTools protocol client over --remote-debugging-pipe:
// fd 3 carries commands to Chrome, fd 4 carries replies and events, as NUL-separated JSON.
class Cdp {
  constructor(proc) {
    this.out = proc.stdio[3];
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    let buffer = "";
    proc.stdio[4].setEncoding("utf8");
    proc.stdio[4].on("data", (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\0")) !== -1) {
        this.dispatch(JSON.parse(buffer.slice(0, end)));
        buffer = buffer.slice(end + 1);
      }
    });
  }

  dispatch(message) {
    const waiting = this.pending.get(message.id);
    if (!waiting) {
      this.listeners.forEach((listener) => listener(message));
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      waiting.reject(new Error(`${message.error.message} ${message.error.data ?? ""}`.trim()));
    } else {
      waiting.resolve(message.result);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.out.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

class Browser {
  constructor(proc, profileDir) {
    this.proc = proc;
    this.profileDir = profileDir;
    this.cdp = new Cdp(proc);
    this.sessionNames = new Map();
    this.consoleLines = [];
    this.errors = [];
    this.stderr = "";
    proc.stderr.on("data", (chunk) => (this.stderr += chunk));
    this.killTimer = setTimeout(() => proc.kill(), 120000);
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

  // Installs the extension like "Load unpacked" and returns its id.
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

  // Opens a tab on a web address without touching the network: every request gets a tiny local page.
  async openOfflineTab(url) {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const session = await this.attach(targetId, `tab ${url}`);
    this.cdp.listeners.push((message) => {
      if (message.sessionId === session && message.method === "Fetch.requestPaused") {
        this.send(
          "Fetch.fulfillRequest",
          {
            requestId: message.params.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/html" }],
            body: Buffer.from("<title>Offline test page</title>").toString("base64"),
          },
          session,
        );
      }
    });
    await this.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, session);
    await this.send("Page.navigate", { url }, session);
    return session;
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
  async screenshot(session, fileName, colorScheme) {
    await this.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 760, deviceScaleFactor: 1, mobile: false }, session);
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: colorScheme }] }, session);
    await sleep(300);
    const { data } = await this.send("Page.captureScreenshot", { format: "png" }, session);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(path.join(OUTPUT_DIR, fileName), Buffer.from(data, "base64"));
  }

  async close() {
    try {
      await Promise.race([this.send("Browser.close"), sleep(5000)]);
    } catch {
      // Chrome may already be gone.
    }
    clearTimeout(this.killTimer);
    this.proc.kill();
    await sleep(1000);
    rmSync(this.profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
}
