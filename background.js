// Service worker: clears cookies when the clean-up alarm fires or the settings page asks for it.

import { CLEANUP_ALARM, ensureCleanupScheduled, scheduleCleanup } from "./schedule.js";
import { hasAllSitesAccess, loadKeptSites, siteToOrigin } from "./sites.js";

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(ensureCleanupScheduled);
chrome.alarms.onAlarm.addListener(handleAlarm);
chrome.runtime.onMessage.addListener(handleMessage);

async function initialize() {
  await loadKeptSites(); // On the first run, this keeps every site that already has cookies.
  await scheduleCleanup();
}

function handleAlarm(alarm) {
  if (alarm.name === CLEANUP_ALARM) {
    runCleanup();
  }
}

// The settings page sends "run-cleanup" when the user clicks "Clean now".
function handleMessage(message, sender, sendResponse) {
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

// Clears the cookies of every site except kept sites and sites open in a tab.
// Open sites that are not kept are cleared on a later run, once their tabs are closed.
async function runCleanup() {
  if (!(await hasAllSitesAccess())) {
    console.warn("Migalhas: clean-up skipped. Without access to all sites, open tabs can't be detected.");
    return { done: false };
  }

  const keptOrigins = (await loadKeptSites()).map(siteToOrigin).filter(Boolean);
  const openOrigins = await getOpenTabOrigins();
  const excludeOrigins = [...new Set([...keptOrigins, ...openOrigins])];
  const options = excludeOrigins.length > 0 ? { excludeOrigins } : {};

  await chrome.browsingData.remove(options, { cookies: true });
  console.log(`Migalhas: cookies cleared. Kept ${keptOrigins.length} site(s) and ${openOrigins.length} open site(s).`);
  return { done: true };
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
