// Service worker: schedules and runs the periodic cookie clean-up.
// Chrome stops this worker when idle, so use chrome.alarms (not setInterval) for timers.

const CLEANUP_ALARM = "cookie-cleanup";
const DEFAULT_INTERVAL_MINUTES = 60;

chrome.runtime.onInstalled.addListener(scheduleCleanup);
chrome.runtime.onStartup.addListener(ensureCleanupScheduled);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLEANUP_ALARM) {
    runCleanup();
  }
});

function scheduleCleanup() {
  chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: DEFAULT_INTERVAL_MINUTES });
}

// Chrome may drop alarms when the browser restarts, so recreate it if missing.
async function ensureCleanupScheduled() {
  const alarm = await chrome.alarms.get(CLEANUP_ALARM);
  if (!alarm) {
    scheduleCleanup();
  }
}

// Clears cookies of every site except those open in a tab right now.
// Skipped sites are cleared on a later run, once their tabs are closed.
async function runCleanup() {
  const openOrigins = await getOpenTabOrigins();
  const options = openOrigins.length > 0 ? { excludeOrigins: openOrigins } : {};

  await chrome.browsingData.remove(options, { cookies: true });
  console.log(`Migalhas: cookies cleared, ${openOrigins.length} open site(s) kept.`);
}

// Returns the unique web origins (http/https) of all open tabs.
// browsingData keeps cookies for the whole domain of each origin (e.g. www.ikea.com keeps ikea.com).
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
