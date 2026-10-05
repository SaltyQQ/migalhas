// Tests the banner rejection with the installed extension on local copies of consent banners,
// so no website is contacted. Includes traps: a page with only "Allow all", and a "reject" button
// whose label says "Aceitar tudo".
// Run from the project folder with: node tests/banners.test.mjs

import { cookiebotPage } from "./fixtures/cookiebot.mjs";
import { createReport, launchBrowser, waitFor } from "./harness.mjs";

const COOKIEBOT_ALLOW_ALL = "CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll";
const COOKIEBOT_CUSTOMIZE = "CybotCookiebotDialogBodyLevelButtonCustomize";
const COOKIEBOT_DECLINE = "CybotCookiebotDialogBodyButtonDecline";
const COOKIEBOT_SAVE = "CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection";

const SCENARIOS = {
  settingsFirst: { url: "https://settings-first.example/", label: "Cookiebot like continente.pt", html: cookiebotPage() },
  firstScreen: {
    url: "https://first-screen.example/",
    label: 'Cookiebot with "Rejeitar todos" on the first screen',
    html: cookiebotPage({ declineOnFirstScreen: true }),
  },
  preticked: {
    url: "https://preticked.example/",
    label: "Cookiebot without a reject button, categories pre-ticked",
    html: cookiebotPage({ hasDecline: false, checked: ["Statistics", "Marketing"] }),
  },
  acceptOnly: {
    url: "https://accept-only.example/",
    label: 'Cookiebot with only "Permitir todos"',
    html: cookiebotPage({ hasDecline: false, hasSettings: false }),
  },
  trap: {
    url: "https://trap.example/",
    label: 'Cookiebot whose reject button says "Aceitar tudo"',
    html: cookiebotPage({ declineOnFirstScreen: true, hasSettings: false, declineLabel: "Aceitar tudo" }),
  },
  noBanner: { url: "https://no-banner.example/", label: "Page without a banner", html: "<!doctype html><title>No banner</title><p>Olá</p>" },
};

const report = createReport();
const { check } = report;
let browser;

const readClicks = (session) => browser.evaluate(session, "window.__clicks ?? []");
const readConsent = (session) =>
  browser.evaluate(
    session,
    `(() => {
      const cookie = document.cookie.split("; ").find((entry) => entry.startsWith("CookieConsent="));
      return cookie ? decodeURIComponent(cookie.slice("CookieConsent=".length)) : null;
    })()`,
  );
const isNecessaryOnly = (consent) => /preferences:false,statistics:false,marketing:false/.test(consent ?? "");
const migalhasLines = (scenario) =>
  browser.consoleLines.filter((line) => line.startsWith(`[tab ${scenario.url}]`) && line.includes("Migalhas:"));
const waitForLog = (scenario, text) =>
  waitFor(() => migalhasLines(scenario).find((line) => line.includes(text)), `"${text}" on ${scenario.url}`, 20000);

async function checkRejected(scenario, expectedClicks) {
  const consent = await waitFor(() => readConsent(scenario.session), `the saved choice on ${scenario.url}`, 20000);
  check(`${scenario.label}: saved necessary cookies only`, isNecessaryOnly(consent), consent);
  const clicks = await readClicks(scenario.session);
  check(`${scenario.label}: clicked ${expectedClicks.join(" → ")}`, JSON.stringify(clicks) === JSON.stringify(expectedClicks), JSON.stringify(clicks));
  const line = await waitForLog(scenario, "banner rejected");
  check(`${scenario.label}: logged the result`, line.includes("Saved: necessary cookies only"), line);
}

async function checkLeftAlone(scenario, expectedLog) {
  const line = await waitForLog(scenario, "left alone");
  check(`${scenario.label}: left alone and logged why`, line.includes(expectedLog), migalhasLines(scenario).join("\n"));
  check(`${scenario.label}: nothing clicked`, (await readClicks(scenario.session)).length === 0, JSON.stringify(await readClicks(scenario.session)));
  check(`${scenario.label}: no choice saved`, (await readConsent(scenario.session)) === null);
}

try {
  browser = await launchBrowser();
  await browser.loadExtension();
  for (const scenario of Object.values(SCENARIOS)) {
    scenario.session = await browser.openOfflineTab(scenario.url, scenario.html);
  }
  const { settingsFirst, firstScreen, preticked, acceptOnly, trap, noBanner } = SCENARIOS;

  await checkRejected(settingsFirst, [COOKIEBOT_CUSTOMIZE, COOKIEBOT_DECLINE]);
  await checkRejected(firstScreen, [COOKIEBOT_DECLINE]);
  await checkRejected(preticked, [
    COOKIEBOT_CUSTOMIZE,
    "CybotCookiebotDialogBodyLevelButtonStatisticsInline",
    "CybotCookiebotDialogBodyLevelButtonMarketingInline",
    COOKIEBOT_SAVE,
  ]);
  await checkLeftAlone(acceptOnly, "no reject button and no settings button");
  await checkLeftAlone(trap, "looks like an accept button");
  check(`${trap.label}: logged the refused click`, migalhasLines(trap).some((line) => line.includes('refused to click "Aceitar tudo"')));
  check(`${noBanner.label}: no Migalhas messages`, migalhasLines(noBanner).length === 0, migalhasLines(noBanner).join("\n"));

  const allClicks = (await Promise.all(Object.values(SCENARIOS).map((scenario) => readClicks(scenario.session)))).flat();
  check('"Permitir todos" was never clicked', !allClicks.includes(COOKIEBOT_ALLOW_ALL), JSON.stringify(allClicks));
} catch (error) {
  check("Test run completed", false, error.stack);
} finally {
  if (browser) {
    check("No errors on any page", browser.errors.length === 0, browser.errors.join("\n"));
    await browser.close();
  }
}

report.finish(browser);
