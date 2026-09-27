// Service worker: schedules and runs the periodic cookie clean-up.
// Chrome stops this worker when idle, so use chrome.alarms (not setInterval) for timers.
