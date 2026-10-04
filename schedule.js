// Clean-up schedule: the chosen interval (saved locally) and the alarm that triggers the clean-up.
// Chrome stops the service worker when idle, so the timer must be a chrome.alarms alarm, never setInterval.

export const CLEANUP_ALARM = "cookie-cleanup";
const INTERVAL_OPTIONS = [15, 60, 1440];
const DEFAULT_INTERVAL_MINUTES = 60;

export async function getIntervalMinutes() {
  const { intervalMinutes } = await chrome.storage.local.get("intervalMinutes");
  return INTERVAL_OPTIONS.includes(intervalMinutes) ? intervalMinutes : DEFAULT_INTERVAL_MINUTES;
}

export async function setIntervalMinutes(minutes) {
  if (!INTERVAL_OPTIONS.includes(minutes)) {
    throw new Error(`Invalid clean-up interval: ${minutes}`);
  }
  await chrome.storage.local.set({ intervalMinutes: minutes });
  await scheduleCleanup();
}

export async function scheduleCleanup() {
  const periodInMinutes = await getIntervalMinutes();
  await chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes });
}

// Chrome may drop alarms when the browser restarts, so recreate it if missing.
export async function ensureCleanupScheduled() {
  const alarm = await chrome.alarms.get(CLEANUP_ALARM);
  if (!alarm) {
    await scheduleCleanup();
  }
}

export async function getNextCleanupTime() {
  const alarm = await chrome.alarms.get(CLEANUP_ALARM);
  return alarm ? new Date(alarm.scheduledTime) : null;
}
