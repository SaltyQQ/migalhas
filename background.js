// Service worker: clears cookies when the clean-up alarm fires or the settings page asks for it,
// and shows on the toolbar icon what happened to the consent banner of each tab.

import { CLEANUP_ALARM, ensureCleanupScheduled, scheduleCleanup } from "./schedule.js";
import { getCookieSites, hasAllSitesAccess, loadKeptSites, siteToOrigin } from "./sites.js";

// Site data cleared along with the cookies of a site (where sites may keep logins too).
const SITE_DATA = { localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true };

// Toolbar badge for each banner result sent by the content script.
const BADGES = {
  rejected: { text: "✓", color: "#1e8e3e" },
  "left-alone": { text: "!", color: "#e37400" },
  failed: { text: "✗", color: "#d93025" },
};

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(ensureCleanupScheduled);
chrome.alarms.onAlarm.addListener(handleAlarm);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.tabs.onUpdated.addListener(clearBadgeOnNavigation);

async function initialize() {
  await loadKeptSites(); // On the first run, this keeps every site that already has cookies.
  await scheduleCleanup();
}

function handleAlarm(alarm) {
  if (alarm.name === CLEANUP_ALARM) {
    runCleanup();
  }
}

// The content script sends "banner-result"; the settings page sends "run-cleanup" ("Clean now").
function handleMessage(message, sender, sendResponse) {
  if (message?.type === "banner-result") {
    showBannerResult(sender.tab?.id, message);
    return false;
  }
  if (message?.type !== "run-cleanup") {
    return false;
  }
  runCleanup()
    .then(sendResponse)
    .catch((error) => {
      console.error("Migalhas: clean-up failed.", error);
      sendResponse({ done: false, error: error.message });
    });
  return true; // Keeps sendResponse valid until the clean-up finishes.
}

async function showBannerResult(tabId, { status, summary }) {
  const badge = BADGES[status];
  if (tabId === undefined || !badge) {
    return;
  }
  await chrome.action.setBadgeText({ tabId, text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  await chrome.action.setTitle({ tabId, title: `Migalhas: ${String(summary).slice(0, 300)}` });
}

// A badge belongs to the page it was set on, so clear it when the tab loads another page.
function clearBadgeOnNavigation(tabId, changeInfo) {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: "Migalhas" });
  }
}

// Clears the cookies of every site except kept sites and sites open in a tab, plus the other site data
// (localStorage, IndexedDB, caches, service workers) of the sites being cleared.
// Open sites that are not kept are cleared on a later run, once their tabs are closed.
async function runCleanup() {
  if (!(await hasAllSitesAccess())) {
    console.warn("Migalhas: clean-up skipped. Without access to all sites, open tabs can't be detected.");
    return { done: false };
  }

  const keptSites = await loadKeptSites();
  const keptOrigins = keptSites.map(siteToOrigin).filter(Boolean);
  const openOrigins = await getOpenTabOrigins();
  // Read before the cookies go: the cookie hosts tell which origins have site data to clear.
  const dataOrigins = await siteDataOriginsToClear(keptSites, openOrigins);

  const excludeOrigins = [...new Set([...keptOrigins, ...openOrigins])];
  await chrome.browsingData.remove(excludeOrigins.length > 0 ? { excludeOrigins } : {}, { cookies: true });
  if (dataOrigins.length > 0) {
    await chrome.browsingData.remove({ origins: dataOrigins }, SITE_DATA);
  }
  console.log(
    `Migalhas: cookies cleared, and other site data of ${dataOrigins.length / 2} host(s). ` +
      `Kept ${keptOrigins.length} site(s) and ${openOrigins.length} open site(s).`,
  );
  return { done: true };
}

// Site data other than cookies is removed per exact origin (not per domain like cookies), so build
// the origins from the cookie hosts of the sites being cleared. To stay on the safe side, a site is
// skipped when its base domain (last two labels) matches a kept site or an open tab.
async function siteDataOriginsToClear(keptSites, openOrigins) {
  const protectedBases = new Set([...keptSites, ...openOrigins.map((origin) => new URL(origin).hostname)].map(baseDomain));
  const origins = [];
  for (const [site, { hosts }] of await getCookieSites()) {
    if (!protectedBases.has(baseDomain(site))) {
      hosts.forEach((host) => origins.push(`https://${host}`, `http://${host}`));
    }
  }
  return origins;
}

function baseDomain(host) {
  return host.split(".").slice(-2).join(".");
}

// Returns the unique web origins (http/https) of all open tabs.
// Reading tab addresses relies on the access to all sites, so no "tabs" permission is needed.
async function getOpenTabOrigins() {
  const tabs = await chrome.tabs.query({});
  const origins = tabs.map((tab) => toWebOrigin(tab.url)).filter(Boolean);
  return [...new Set(origins)];
}

function toWebOrigin(url) {
  try {
    const { protocol, origin } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? origin : null;
  } catch {
    return null;
  }
}
