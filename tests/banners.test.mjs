// Tests the banner rejection with the installed extension on local copies of consent banners,
// so no website is contacted. Includes traps: banners with only "Allow all", and "reject" buttons
// whose label says "Aceitar…".
// Run from the project folder with: node tests/banners.test.mjs

import { cookiebotPage } from "./fixtures/cookiebot.mjs";
import { oneTrustPage } from "./fixtures/onetrust.mjs";
import { createReport, launchBrowser, waitFor } from "./harness.mjs";

// How each consent platform saves the choice, and the ids of its accept buttons.
const CMPS = {
  cookiebot: {
    savedChoice: `(() => {
      const cookie = document.cookie.split("; ").find((entry) => entry.startsWith("CookieConsent="));
      return cookie ? decodeURIComponent(cookie.slice("CookieConsent=".length)) : null;
    })()`,
    isNecessaryOnly: (saved) => /preferences:false,statistics:false,marketing:false/.test(saved ?? ""),
    acceptButtons: ["CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"],
  },
  onetrust: {
    savedChoice: `(() => {
      const cookie = document.cookie.split("; ").find((entry) => entry.startsWith("OptanonConsent="));
      return cookie ? new URLSearchParams(cookie.slice("OptanonConsent=".length)).get("groups") : null;
    })()`,
    isNecessaryOnly: (saved) => saved === "1:1,2:0,3:0,4:0",
    acceptButtons: ["onetrust-accept-btn-handler", "accept-recommended-btn-handler"],
  },
};

const COOKIEBOT_CUSTOMIZE = "CybotCookiebotDialogBodyLevelButtonCustomize";
const COOKIEBOT_DECLINE = "CybotCookiebotDialogBodyButtonDecline";

const SCENARIOS = {
  cbSettingsFirst: { cmp: "cookiebot", url: "https://settings-first.example/", label: "Cookiebot like continente.pt", html: cookiebotPage() },
  cbFirstScreen: {
    cmp: "cookiebot",
    url: "https://first-screen.example/",
    label: 'Cookiebot with "Rejeitar todos" on the first screen',
    html: cookiebotPage({ declineOnFirstScreen: true }),
  },
  cbPreticked: {
    cmp: "cookiebot",
    url: "https://preticked.example/",
    label: "Cookiebot without a reject button, categories pre-ticked",
    html: cookiebotPage({ hasDecline: false, checked: ["Statistics", "Marketing"] }),
  },
  cbAcceptOnly: {
    cmp: "cookiebot",
    url: "https://accept-only.example/",
    label: 'Cookiebot with only "Permitir todos"',
    html: cookiebotPage({ hasDecline: false, hasSettings: false }),
  },
  cbTrap: {
    cmp: "cookiebot",
    url: "https://trap.example/",
    label: 'Cookiebot whose reject button says "Aceitar tudo"',
    html: cookiebotPage({ declineOnFirstScreen: true, hasSettings: false, declineLabel: "Aceitar tudo" }),
  },
  otFirstScreen: { cmp: "onetrust", url: "https://onetrust-first-screen.example/", label: "OneTrust like ikea.com", html: oneTrustPage() },
  otSettings: {
    cmp: "onetrust",
    url: "https://onetrust-settings.example/",
    label: "OneTrust with the reject button only in the preference centre",
    html: oneTrustPage({ rejectOnFirstScreen: false }),
  },
  otPreticked: {
    cmp: "onetrust",
    url: "https://onetrust-preticked.example/",
    label: "OneTrust without a reject button, groups pre-ticked",
    html: oneTrustPage({ rejectOnFirstScreen: false, centreHasReject: false, checked: ["3", "4"] }),
  },
  otTrap: {
    cmp: "onetrust",
    url: "https://onetrust-trap.example/",
    label: 'OneTrust whose reject button says "Aceitar todos"',
    html: oneTrustPage({ hasSettings: false, rejectLabel: "Aceitar todos" }),
  },
  noBanner: { url: "https://no-banner.example/", label: "Page without a banner", html: "<!doctype html><title>No banner</title><p>Olá</p>" },
};

const report = createReport();
const { check } = report;
let browser;

const readClicks = (scenario) => browser.evaluate(scenario.session, "window.__clicks ?? []");
const readSaved = (scenario) => browser.evaluate(scenario.session, CMPS[scenario.cmp].savedChoice);
const migalhasLines = (scenario) =>
  browser.consoleLines.filter((line) => line.startsWith(`[tab ${scenario.url}]`) && line.includes("Migalhas:"));
const waitForLog = (scenario, text) =>
  waitFor(() => migalhasLines(scenario).find((line) => line.includes(text)), `"${text}" on ${scenario.url}`, 20000);

async function checkRejected(scenario, expectedClicks) {
  const saved = await waitFor(() => readSaved(scenario), `the saved choice on ${scenario.url}`, 20000);
  check(`${scenario.label}: saved necessary cookies only`, CMPS[scenario.cmp].isNecessaryOnly(saved), saved);
  const clicks = await readClicks(scenario);
  check(`${scenario.label}: clicked ${expectedClicks.join(" → ")}`, JSON.stringify(clicks) === JSON.stringify(expectedClicks), JSON.stringify(clicks));
  const line = await waitForLog(scenario, "banner rejected");
  check(`${scenario.label}: logged the result`, line.includes("Saved: necessary cookies only"), line);
}

async function checkLeftAlone(scenario, expectedLog) {
  const line = await waitForLog(scenario, "left alone");
  check(`${scenario.label}: left alone and logged why`, line.includes(expectedLog), migalhasLines(scenario).join("\n"));
  const clicks = await readClicks(scenario);
  check(`${scenario.label}: nothing clicked`, clicks.length === 0, JSON.stringify(clicks));
  check(`${scenario.label}: no choice saved`, (await readSaved(scenario)) === null);
}

try {
  browser = await launchBrowser();
  await browser.loadExtension();
  for (const scenario of Object.values(SCENARIOS)) {
    scenario.session = await browser.openOfflineTab(scenario.url, scenario.html);
  }
  const s = SCENARIOS;

  await checkRejected(s.cbSettingsFirst, [COOKIEBOT_CUSTOMIZE, COOKIEBOT_DECLINE]);
  await checkRejected(s.cbFirstScreen, [COOKIEBOT_DECLINE]);
  await checkRejected(s.cbPreticked, [
    COOKIEBOT_CUSTOMIZE,
    "CybotCookiebotDialogBodyLevelButtonStatisticsInline",
    "CybotCookiebotDialogBodyLevelButtonMarketingInline",
    "CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection",
  ]);
  await checkLeftAlone(s.cbAcceptOnly, "no reject button and no settings button");
  await checkLeftAlone(s.cbTrap, "looks like an accept button");
  check(`${s.cbTrap.label}: logged the refused click`, migalhasLines(s.cbTrap).some((line) => line.includes('refused to click "Aceitar tudo"')));

  await checkRejected(s.otFirstScreen, ["onetrust-reject-all-handler"]);
  await checkRejected(s.otSettings, ["onetrust-pc-btn-handler", "ot-pc-refuse-all-handler"]);
  await checkRejected(s.otPreticked, ["onetrust-pc-btn-handler", "ot-group-id-3", "ot-group-id-4", "save-preference-btn-handler"]);
  await checkLeftAlone(s.otTrap, "looks like an accept button");
  check(`${s.otTrap.label}: logged the refused click`, migalhasLines(s.otTrap).some((line) => line.includes('refused to click "Aceitar todos"')));

  check(`${s.noBanner.label}: no Migalhas messages`, migalhasLines(s.noBanner).length === 0, migalhasLines(s.noBanner).join("\n"));

  const withBanner = Object.values(SCENARIOS).filter((scenario) => scenario.cmp);
  const acceptClicks = (await Promise.all(withBanner.map(async (scenario) => ({ scenario, clicks: await readClicks(scenario) }))))
    .flatMap(({ scenario, clicks }) => clicks.filter((id) => CMPS[scenario.cmp].acceptButtons.includes(id)));
  check("No accept button was ever clicked", acceptClicks.length === 0, JSON.stringify(acceptClicks));
} catch (error) {
  check("Test run completed", false, error.stack);
} finally {
  if (browser) {
    check("No errors on any page", browser.errors.length === 0, browser.errors.join("\n"));
    await browser.close();
  }
}

report.finish(browser);
