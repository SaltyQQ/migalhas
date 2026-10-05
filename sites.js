// Sites with cookies, and the user's choices per site: kept and locked (saved locally).
// A "site" is a cookie domain together with its subdomains, e.g. "accounts.google.com" is listed under "google.com".

const ALL_SITES = ["http://*/*", "https://*/*"];

// Without access to all sites, cookies can't be listed and open tabs can't be detected.
export function hasAllSitesAccess() {
  return chrome.permissions.contains({ origins: ALL_SITES });
}

// Returns a Map of site -> number of cookies.
export async function getCookieSites() {
  const cookies = await chrome.cookies.getAll({});
  const countsByHost = new Map();
  for (const cookie of cookies) {
    const host = cookie.domain.replace(/^\./, "");
    countsByHost.set(host, (countsByHost.get(host) ?? 0) + 1);
  }
  return groupBySite(countsByHost);
}

// Adds each host to the shortest listed host it belongs to, e.g. "mail.google.com" to "google.com".
// Hosts are processed shortest first, so a parent is already listed when its subdomains arrive.
function groupBySite(countsByHost) {
  const sites = new Map();
  const hosts = [...countsByHost.keys()].sort((a, b) => a.length - b.length);
  for (const host of hosts) {
    const site = findParentSite(host, sites) ?? host;
    sites.set(site, (sites.get(site) ?? 0) + countsByHost.get(host));
  }
  return sites;
}

function findParentSite(host, sites) {
  const labels = host.split(".");
  for (let i = labels.length - 1; i > 0; i--) {
    const candidate = labels.slice(i).join(".");
    if (sites.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Returns the kept sites. On the very first run, keeps every site that already has cookies,
// so installing the extension never logs anyone out. Sites that appear later start switched off.
export async function loadKeptSites() {
  const { keptSites } = await chrome.storage.local.get("keptSites");
  if (Array.isArray(keptSites)) {
    return keptSites;
  }
  if (!(await hasAllSitesAccess())) {
    return []; // Cookies can't be listed yet, so take the first-run snapshot later.
  }
  const existingSites = [...(await getCookieSites()).keys()];
  await saveKeptSites(existingSites);
  return existingSites;
}

export async function saveKeptSites(sites) {
  await chrome.storage.local.set({ keptSites: sites });
}

// Locked sites keep their switch as it is on the settings page, so it can't change by accident.
export async function loadLockedSites() {
  const { lockedSites } = await chrome.storage.local.get("lockedSites");
  return Array.isArray(lockedSites) ? lockedSites : [];
}

export async function saveLockedSites(sites) {
  await chrome.storage.local.set({ lockedSites: sites });
}

// browsingData keeps cookies for the whole registrable domain of an origin, so keeping
// "mail.google.com" also keeps the cookies of every other google.com subdomain.
export function siteToOrigin(site) {
  try {
    return new URL(`https://${site}`).origin;
  } catch {
    return null;
  }
}
