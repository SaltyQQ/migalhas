// Checks the consent rules on the real test sites (needs internet). Chrome runs without administrator
// rights, and the content scripts are injected the way Chrome injects them for the installed extension.
// Sites change their banners over time, so a failure can mean the site changed, not our code.
// Run from the project folder with: node tests/real-sites.test.mjs

import { createReport, launchBrowser, waitFor } from "./harness.mjs";

const SITES = [
  {
    name: "continente.pt (Cookiebot)",
    url: "https://www.continente.pt/",
    screenshot: "real-continente.png",
    bannerSelector: "#CybotCookiebotDialog",
    savedChoice: `decodeURIComponent(document.cookie.split("; ").find((c) => c.startsWith("CookieConsent="))?.slice(14) ?? "")`,
    isNecessaryOnly: (saved) => /necessary:true,preferences:false,statistics:false,marketing:false/.test(saved),
  },
  {
    name: "ikea.com/pt (OneTrust)",
    url: "https://www.ikea.com/pt/pt/",
    screenshot: "real-ikea.png",
    bannerSelector: "#onetrust-banner-sdk",
    savedChoice: `new URLSearchParams(document.cookie.split("; ").find((c) => c.startsWith("OptanonConsent="))?.slice(15) ?? "").get("groups") ?? ""`,
    // Group 1 (C0001 on most sites) is "strictly necessary" and always on.
    isNecessaryOnly: (groups) =>
      groups !== "" &&
      groups.split(",").every((entry) => {
        const [id, on] = entry.split(":");
        return on === "0" || ["1", "C0001"].includes(id);
      }),
  },
  {
    name: "sapo.pt (InMobi Choice)",
    url: "https://www.sapo.pt/",
    screenshot: "real-sapo.png",
    bannerSelector: '#qc-cmp2-container button[mode="primary"]',
    // Read through the standard TCF API; "legitimate interest" purposes are only reported (see CLAUDE.md).
    savedChoice: `new Promise((resolve) => {
      if (!window.__tcfapi) return resolve("no __tcfapi");
      const on = (map) => Object.keys(map ?? {}).filter((key) => map[key]);
      __tcfapi("getTCData", 2, (data) => resolve(JSON.stringify({ saved: !!data.tcString, consents: on(data.purpose?.consents),
        features: on(data.specialFeatureOptins), vendors: on(data.vendor?.consents).length })));
    })`,
    isNecessaryOnly: (saved) => {
      try {
        const choice = JSON.parse(saved);
        return choice.saved && choice.consents.length === 0 && choice.features.length === 0 && choice.vendors === 0;
      } catch {
        return false;
      }
    },
  },
];

const report = createReport();
const { check } = report;
let browser;

const isMigalhasLine = (line) => line.includes("Migalhas") || line.includes("migalhas/");

try {
  browser = await launchBrowser({ realSites: true });
  for (const site of SITES) {
    const page = await browser.openRealPage(site.url);
    await browser.injectContentScripts(page);
    const line = await waitFor(
      () => browser.consoleLines.find((entry) => entry.startsWith(`[page ${site.url}]`) && entry.includes("Migalhas:")),
      `the Migalhas result on ${site.url}`,
      30000,
    );
    check(`${site.name}: Migalhas rejected the banner`, line.includes("Saved: necessary cookies only"), line);
    const saved = await browser.evaluate(page, site.savedChoice);
    check(`${site.name}: the site saved necessary cookies only`, site.isNecessaryOnly(saved), saved);
    // Some banners close with an animation, so wait for them to go.
    const bannerClosed = await waitFor(
      () =>
        browser.evaluate(
          page,
          `(() => {
            const banner = document.querySelector(${JSON.stringify(site.bannerSelector)});
            if (!banner) return true;
            const style = getComputedStyle(banner);
            return banner.getBoundingClientRect().width === 0 || style.display === "none" ||
              style.visibility === "hidden" || Number(style.opacity) === 0;
          })()`,
        ),
      `the banner on ${site.url} to close`,
      5000,
    ).catch(() => false);
    check(`${site.name}: banner closed`, bannerClosed);
    await browser.screenshot(page, site.screenshot);
  }
} catch (error) {
  check("Test run completed", false, error.stack);
} finally {
  if (browser) {
    const ourErrors = browser.errors.filter(isMigalhasLine);
    check("No Migalhas errors (errors from the sites themselves are ignored)", ourErrors.length === 0, ourErrors.join("\n"));
    await browser.close();
  }
}

report.finish(browser, { showConsole: isMigalhasLine });
