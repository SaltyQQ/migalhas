// Settings page: clean-up interval, "Clean now", and the list of sites with a keep/clear switch
// and a padlock that stops the switch from changing by accident.

import { getIntervalMinutes, getNextCleanupTime, setIntervalMinutes } from "../schedule.js";
import {
  getCookieSites,
  hasAllSitesAccess,
  loadKeptSites,
  loadLockedSites,
  saveKeptSites,
  saveLockedSites,
} from "../sites.js";

const SVG_NS = "http://www.w3.org/2000/svg";
// Padlock shackle: closed, or open with its right leg out of the body.
const SHACKLE_PATHS = { locked: "M5 7V5a3 3 0 0 1 6 0v2", unlocked: "M5 7V5a3 3 0 0 1 6 0" };

const accessWarning = document.getElementById("access-warning");
const intervalSelect = document.getElementById("interval");
const cleanNowButton = document.getElementById("clean-now");
const nextCleanupText = document.getElementById("next-cleanup");
const statusText = document.getElementById("status");
const searchInput = document.getElementById("search");
const siteList = document.getElementById("site-list");

let keptSites = new Set();
let lockedSites = new Set();

init();

// Text in the browser's language, from _locales/<language>/messages.json.
function t(key, ...substitutions) {
  return chrome.i18n.getMessage(key, substitutions.map(String));
}

function translatePage() {
  document.documentElement.lang = t("htmlLang");
  document.title = t("pageTitle");
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
}

async function init() {
  translatePage();
  accessWarning.hidden = await hasAllSitesAccess();
  intervalSelect.value = String(await getIntervalMinutes());
  await showNextCleanup();
  await renderSites();

  intervalSelect.addEventListener("change", changeInterval);
  cleanNowButton.addEventListener("click", cleanNow);
  searchInput.addEventListener("input", filterSites);
  document.getElementById("switch-all-on").addEventListener("click", () => switchShownSites(true));
  document.getElementById("switch-all-off").addEventListener("click", () => switchShownSites(false));
}

async function changeInterval() {
  await setIntervalMinutes(Number(intervalSelect.value));
  await showNextCleanup();
}

async function showNextCleanup() {
  const time = await getNextCleanupTime();
  nextCleanupText.textContent = time ? t("nextCleanup", formatTime(time)) : t("noCleanupScheduled");
}

async function cleanNow() {
  cleanNowButton.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "run-cleanup" });
    statusText.textContent = describeCleanup(result);
    await renderSites();
  } finally {
    cleanNowButton.disabled = false;
  }
}

function describeCleanup(result) {
  if (result?.done) {
    return t("cleanedAt", formatTime(new Date()));
  }
  if (result?.error) {
    return t("cleanupFailed", result.error);
  }
  return t("cleanupSkipped");
}

// Lists every site with cookies, plus kept sites that currently have none.
async function renderSites() {
  const cookieSites = await getCookieSites();
  keptSites = new Set(await loadKeptSites());
  lockedSites = new Set(await loadLockedSites());
  const sites = [...new Set([...cookieSites.keys(), ...keptSites])].sort();
  siteList.replaceChildren(...sites.map((site) => createSiteRow(site, cookieSites.get(site)?.cookies ?? 0)));
  filterSites();
}

// Only the switch itself changes the site (no clickable label), to avoid changes by accident.
function createSiteRow(site, cookieCount) {
  const row = document.createElement("li");
  row.className = "site";
  row.dataset.site = site;

  const name = document.createElement("span");
  name.className = "site-name";
  name.textContent = site;

  const count = document.createElement("span");
  count.className = "site-meta";
  count.textContent = cookieCount === 1 ? t("cookieCountOne") : t("cookieCountMany", cookieCount);

  const lock = document.createElement("button");
  lock.type = "button";
  lock.className = "lock";
  lock.setAttribute("aria-label", t("lockSite", site));
  lock.addEventListener("click", () => toggleLock(row));

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "switch";
  toggle.checked = keptSites.has(site);
  toggle.setAttribute("aria-label", t("keepSite", site));
  toggle.addEventListener("change", () => setSiteKept(site, toggle.checked));

  row.append(name, count, lock, toggle);
  showLockState(row, lockedSites.has(site));
  return row;
}

async function setSiteKept(site, kept) {
  updateSet(keptSites, site, kept);
  await saveKeptSites([...keptSites]);
}

async function toggleLock(row) {
  const locked = !lockedSites.has(row.dataset.site);
  updateSet(lockedSites, row.dataset.site, locked);
  showLockState(row, locked);
  await saveLockedSites([...lockedSites]);
}

// A locked switch is disabled, so neither a click nor "Switch all on/off" can change it.
function showLockState(row, locked) {
  const lock = row.querySelector(".lock");
  lock.setAttribute("aria-pressed", String(locked));
  lock.title = locked ? t("lockedTitle") : t("unlockedTitle");
  lock.replaceChildren(createLockIcon(locked));
  row.querySelector(".switch").disabled = locked;
}

function createLockIcon(locked) {
  const icon = createSvgElement("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" });
  icon.append(
    createSvgElement("path", {
      d: locked ? SHACKLE_PATHS.locked : SHACKLE_PATHS.unlocked,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.6,
    }),
    createSvgElement("rect", { x: 3, y: 7, width: 10, height: 8, rx: 1.5, fill: "currentColor" }),
  );
  return icon;
}

function createSvgElement(tag, attributes) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function updateSet(set, item, included) {
  if (included) {
    set.add(item);
  } else {
    set.delete(item);
  }
}

function filterSites() {
  const query = searchInput.value.trim().toLowerCase();
  for (const row of siteList.children) {
    row.hidden = !row.dataset.site.includes(query);
  }
}

// Changes the switches of the sites shown, skipping locked ones.
async function switchShownSites(kept) {
  for (const row of siteList.children) {
    if (!row.hidden && !lockedSites.has(row.dataset.site)) {
      row.querySelector(".switch").checked = kept;
      updateSet(keptSites, row.dataset.site, kept);
    }
  }
  await saveKeptSites([...keptSites]);
}

function formatTime(date) {
  return date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
