// Settings page: clean-up interval, "Clean now", and the list of sites with a keep/clear switch.

import { getIntervalMinutes, getNextCleanupTime, setIntervalMinutes } from "../schedule.js";
import { getCookieSites, hasAllSitesAccess, loadKeptSites, saveKeptSites } from "../sites.js";

const accessWarning = document.getElementById("access-warning");
const intervalSelect = document.getElementById("interval");
const cleanNowButton = document.getElementById("clean-now");
const nextCleanupText = document.getElementById("next-cleanup");
const statusText = document.getElementById("status");
const searchInput = document.getElementById("search");
const siteList = document.getElementById("site-list");

let keptSites = new Set();

init();

async function init() {
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
  nextCleanupText.textContent = time ? `Next clean-up: ${formatTime(time)}` : "No clean-up scheduled.";
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
    return `Cookies cleared at ${formatTime(new Date())}.`;
  }
  if (result?.error) {
    return `Clean-up failed: ${result.error}`;
  }
  return "Clean-up skipped: Migalhas needs access to all sites.";
}

// Lists every site with cookies, plus kept sites that currently have none.
async function renderSites() {
  const cookieSites = await getCookieSites();
  keptSites = new Set(await loadKeptSites());
  const sites = [...new Set([...cookieSites.keys(), ...keptSites])].sort();
  siteList.replaceChildren(...sites.map((site) => createSiteRow(site, cookieSites.get(site) ?? 0)));
  filterSites();
}

function createSiteRow(site, cookieCount) {
  const name = document.createElement("span");
  name.className = "site-name";
  name.textContent = site;

  const count = document.createElement("span");
  count.className = "site-meta";
  count.textContent = cookieCount === 1 ? "1 cookie" : `${cookieCount} cookies`;

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.className = "switch";
  toggle.checked = keptSites.has(site);
  toggle.setAttribute("aria-label", `Keep cookies of ${site}`);
  toggle.addEventListener("change", () => setSiteKept(site, toggle.checked));

  const label = document.createElement("label");
  label.className = "site";
  label.append(name, count, toggle);

  const row = document.createElement("li");
  row.dataset.site = site;
  row.append(label);
  return row;
}

async function setSiteKept(site, kept) {
  markSite(site, kept);
  await saveKeptSites([...keptSites]);
}

function markSite(site, kept) {
  if (kept) {
    keptSites.add(site);
  } else {
    keptSites.delete(site);
  }
}

function filterSites() {
  const query = searchInput.value.trim().toLowerCase();
  for (const row of siteList.children) {
    row.hidden = !row.dataset.site.includes(query);
  }
}

async function switchShownSites(kept) {
  for (const row of siteList.children) {
    if (!row.hidden) {
      row.querySelector(".switch").checked = kept;
      markSite(row.dataset.site, kept);
    }
  }
  await saveKeptSites([...keptSites]);
}

function formatTime(date) {
  return date.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
