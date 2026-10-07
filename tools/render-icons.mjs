// Renders icons/icon.svg to the PNG sizes Chrome uses (icons/icon-16.png … icon-128.png), with a
// transparent background, using the same headless Chrome as the tests. No npm packages.
// Run from the project folder with: node tools/render-icons.mjs

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launchBrowser, PROJECT_DIR, waitFor } from "../tests/harness.mjs";

const SIZES = [16, 32, 48, 128];
const svg = readFileSync(path.join(PROJECT_DIR, "icons", "icon.svg"), "utf8");
const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const browser = await launchBrowser();
try {
  for (const size of SIZES) {
    const html = `<!doctype html><body style="margin: 0; background: transparent"><img src="${svgUrl}" width="${size}" height="${size}" style="display: block"></body>`;
    const page = await browser.openOfflineTab(`https://icon-${size}.example/`, html);
    await waitFor(() => browser.evaluate(page, `document.images[0]?.complete === true`), "the icon to load");
    await browser.send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false }, page);
    await browser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } }, page);
    const { data } = await browser.send("Page.captureScreenshot", { format: "png" }, page);
    writeFileSync(path.join(PROJECT_DIR, "icons", `icon-${size}.png`), Buffer.from(data, "base64"));
    console.log(`icons/icon-${size}.png`);
  }
} finally {
  await browser.close();
}
