// Tests the settings page and the cookie clean-up: first-run snapshot, switches, search,
// "Switch all on/off", padlocks, "Clean now" and the interval.
// Run from the project folder with: node tests/settings.test.mjs

import { createReport, launchBrowser, sameSet, sleep, waitFor } from "./harness.mjs";

const report = createReport();
const { check } = report;
let browser;

const readStored = (session, key) => browser.evaluate(session, `chrome.storage.local.get("${key}").then((r) => r.${key})`);
const readKept = (session) => readStored(session, "keptSites");
const readLocked = (session) => readStored(session, "lockedSites");
const readAlarm = (session) => browser.evaluate(session, `chrome.alarms.get("cookie-cleanup")`);
const readText = (page, id) => browser.evaluate(page, `document.getElementById(${JSON.stringify(id)}).textContent`);
const click = (page, selector) => browser.evaluate(page, `document.querySelector(${JSON.stringify(selector)}).click()`);

// "shown" reads the computed style, so it also catches CSS that would override the hidden attribute.
const readRows = (page) =>
  browser.evaluate(
    page,
    `[...document.querySelectorAll("#site-list li")].map((li) => ({
      site: li.dataset.site,
      on: li.querySelector(".switch").checked,
      disabled: li.querySelector(".switch").disabled,
      locked: li.querySelector(".lock").getAttribute("aria-pressed") === "true",
      shown: getComputedStyle(li).display !== "none",
      meta: li.querySelector(".site-meta").textContent,
    }))`,
  );

const readRow = async (page, site) => (await readRows(page)).find((row) => row.site === site);
const shownSites = async (page) => (await readRows(page)).filter((row) => row.shown).map((row) => row.site);

const setField = (page, id, value, eventName) =>
  browser.evaluate(
    page,
    `(() => {
      const field = document.getElementById(${JSON.stringify(id)});
      field.value = ${JSON.stringify(value)};
      field.dispatchEvent(new Event(${JSON.stringify(eventName)}));
    })()`,
  );

// Waits until the saved kept sites satisfy the condition, then returns them.
const waitForKept = (page, condition, label) =>
  waitFor(async () => {
    const kept = await readKept(page);
    return kept && condition(kept) ? kept : null;
  }, label);

async function reloadPage(page) {
  await browser.evaluate(page, "window.beforeReload = true");
  await browser.send("Page.reload", {}, page);
  await waitFor(
    () => browser.evaluate(page, `!window.beforeReload && document.querySelectorAll("#site-list li").length > 0`),
    "the reloaded page",
  );
}

try {
  browser = await launchBrowser();

  // Sites that already have cookies before the extension is installed.
  await browser.setCookies(["example.com", "example.org"]);
  const extensionId = await browser.loadExtension();
  const worker = await browser.attachServiceWorker(extensionId);

  const keptAtInstall = await waitFor(() => readKept(worker), "first-run snapshot");
  check("First run keeps every existing site", sameSet(keptAtInstall, ["example.com", "example.org"]), JSON.stringify(keptAtInstall));
  const firstAlarm = await readAlarm(worker);
  check("Alarm created every 60 minutes", firstAlarm?.periodInMinutes === 60, JSON.stringify(firstAlarm));

  // Sites that appear after installation, and an open tab on one of them.
  await browser.setCookies(["example.net", "iana.org"]);
  await browser.openOfflineTab("https://example.net/");

  const page = await browser.openPage(`chrome-extension://${extensionId}/options/options.html`, "settings page");
  await waitFor(async () => (await readRows(page)).length >= 4, "the site list");

  const rows = Object.fromEntries((await readRows(page)).map((row) => [row.site, row]));
  check("Existing sites start switched on", rows["example.com"]?.on && rows["example.org"]?.on, JSON.stringify(rows));
  check("New sites start switched off", rows["example.net"]?.on === false && rows["iana.org"]?.on === false);
  check("Sites start unlocked", Object.values(rows).every((row) => !row.locked && !row.disabled));
  check("Cookie count shown", rows["example.com"]?.meta === "1 cookie", rows["example.com"]?.meta);
  check("No access warning", await browser.evaluate(page, `document.getElementById("access-warning").hidden`));
  check("Interval shows 1 hour", (await browser.evaluate(page, `document.getElementById("interval").value`)) === "60");
  const nextText = await readText(page, "next-cleanup");
  check("Next clean-up shown", nextText.startsWith("Next clean-up:"), nextText);
  await browser.screenshot(page, "settings-initial-dark.png", "dark");

  // Switching a kept site off.
  await click(page, 'li[data-site="example.org"] .switch');
  const keptAfterToggle = await waitForKept(page, (kept) => !kept.includes("example.org"), "switch saved");
  check("Switching off is saved", sameSet(keptAfterToggle, ["example.com"]), JSON.stringify(keptAfterToggle));

  // Search, and the bulk buttons only change the sites shown.
  await setField(page, "search", "example.c", "input");
  check("Search hides the other sites", sameSet(await shownSites(page), ["example.com"]), JSON.stringify(await shownSites(page)));
  await setField(page, "search", "iana", "input");
  await click(page, "#switch-all-on");
  const keptAfterAllOn = await waitForKept(page, (kept) => kept.includes("iana.org"), "switch all on");
  check('"Switch all on" only changes shown sites', sameSet(keptAfterAllOn, ["example.com", "iana.org"]), JSON.stringify(keptAfterAllOn));
  await click(page, "#switch-all-off");
  const keptAfterAllOff = await waitForKept(page, (kept) => !kept.includes("iana.org"), "switch all off");
  check('"Switch all off" only changes shown sites', sameSet(keptAfterAllOff, ["example.com"]), JSON.stringify(keptAfterAllOff));
  await setField(page, "search", "", "input");
  check("Clearing the search shows every site", (await shownSites(page)).length === 4);

  // Padlock: a locked switch can't change, by click or by "Switch all on/off".
  await click(page, 'li[data-site="example.org"] .switch');
  await waitForKept(page, (kept) => kept.includes("example.org"), "example.org switched back on");
  await click(page, 'li[data-site="example.com"] .lock');
  const locked = await waitFor(async () => {
    const sites = await readLocked(page);
    return sites?.includes("example.com") ? sites : null;
  }, "lock saved");
  check("Locking is saved", sameSet(locked, ["example.com"]), JSON.stringify(locked));
  const lockedRow = await readRow(page, "example.com");
  check("Locked switch is disabled", lockedRow.locked && lockedRow.disabled, JSON.stringify(lockedRow));
  await browser.screenshot(page, "settings-locked-dark.png", "dark");

  await click(page, "#switch-all-off");
  const keptAfterLockedAllOff = await waitForKept(page, (kept) => !kept.includes("example.org"), "switch all off with a lock");
  check(
    '"Switch all off" skips locked sites',
    sameSet(keptAfterLockedAllOff, ["example.com"]) && (await readRow(page, "example.com")).on,
    JSON.stringify(keptAfterLockedAllOff),
  );

  await click(page, 'li[data-site="example.com"] .switch');
  await sleep(300);
  check(
    "Clicking a locked switch changes nothing",
    (await readRow(page, "example.com")).on && (await readKept(page)).includes("example.com"),
  );

  await reloadPage(page);
  const rowAfterReload = await readRow(page, "example.com");
  check("Lock survives a page reload", rowAfterReload.locked && rowAfterReload.disabled, JSON.stringify(rowAfterReload));

  await click(page, 'li[data-site="example.com"] .lock');
  await waitFor(async () => !(await readLocked(page)).includes("example.com"), "unlock saved");
  check("Unlocking enables the switch", !(await readRow(page, "example.com")).disabled);
  await click(page, 'li[data-site="example.com"] .switch');
  const keptAfterUnlockedClick = await waitForKept(page, (kept) => !kept.includes("example.com"), "unlocked switch change");
  check("Unlocked switch changes again", !keptAfterUnlockedClick.includes("example.com"));
  await click(page, 'li[data-site="example.com"] .switch');
  await waitForKept(page, (kept) => kept.includes("example.com"), "example.com switched back on");

  // Clean now.
  const domainsBefore = await browser.cookieDomains();
  check("Cookies before clean-up", sameSet(domainsBefore, ["example.com", "example.net", "example.org", "iana.org"]), JSON.stringify(domainsBefore));
  await click(page, "#clean-now");
  const status = await waitFor(() => readText(page, "status"), "the clean-up status");
  check('"Clean now" reports success', status.startsWith("Cookies cleared at"), status);
  const domainsAfter = await browser.cookieDomains();
  check("Kept site survives (example.com)", domainsAfter.includes("example.com"), JSON.stringify(domainsAfter));
  check("Open-tab site survives although switched off (example.net)", domainsAfter.includes("example.net"));
  check("Switched-off site is cleared (example.org)", !domainsAfter.includes("example.org"));
  check("New site without a tab is cleared (iana.org)", !domainsAfter.includes("iana.org"));
  const sitesAfter = (await readRows(page)).map((row) => row.site);
  check("List refreshed after clean-up", sameSet(sitesAfter, ["example.com", "example.net"]), JSON.stringify(sitesAfter));

  // Changing the interval.
  await setField(page, "interval", "15", "change");
  const newAlarm = await waitFor(async () => {
    const alarm = await readAlarm(page);
    return alarm?.periodInMinutes === 15 ? alarm : null;
  }, "the rescheduled alarm");
  const minutesAway = (newAlarm.scheduledTime - Date.now()) / 60000;
  check("Interval change reschedules the alarm to 15 min", minutesAway > 14 && minutesAway <= 15, `${minutesAway.toFixed(2)} min away`);
  const savedInterval = await readStored(page, "intervalMinutes");
  check("Interval saved", savedInterval === 15, String(savedInterval));
  await browser.screenshot(page, "settings-after-cleanup-light.png", "light");

  const cleanupLog = browser.consoleLines.find((line) => line.includes("Migalhas: cookies cleared"));
  check("Service worker logged the clean-up", cleanupLog, cleanupLog);
} catch (error) {
  check("Test run completed", false, error.stack);
} finally {
  if (browser) {
    check("No errors in service worker or settings page", browser.errors.length === 0, browser.errors.join("\n"));
    await browser.close();
  }
}

report.finish(browser);
