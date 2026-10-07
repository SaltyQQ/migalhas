// Content script: finds a cookie consent banner, rejects everything except strictly necessary cookies,
// then checks what the site saved. Each consent platform (CMP) has its own rule in rules/.
// Safety: clickSafely never clicks a button whose label looks like "Accept" or "Allow all",
// so even a broken rule can't accept cookies.

const BANNER_WAIT_MS = 15000;
const CONSENT_WAIT_MS = 5000;
const POLL_MS = 250;
const TCF_TIMEOUT_MS = 1000;

// Labels that mean "accept", in Portuguese, English and neighbouring languages.
const ACCEPT_LABELS = [
  /\baccept/i,
  /\bagree\b/i,
  /\ballow all\b/i,
  /\baceit/i,
  /\bconcordo\b/i,
  /\bpermitir (todos|todas|tudo)\b/i,
  /\bacept/i,
  /\baccepte/i,
  /\bautoriser tout/i,
  /\bakzeptier/i,
  /\bzustimm/i,
  /\balle (erlauben|zulassen)\b/i,
  /\baccett/i,
  /^(ok|okay|got it|allow|permitir|consent|consentir|entendi)$/i,
];

// Reject buttons that mention accepting, e.g. "Continuar sem aceitar" ("continue without accepting").
const WITHOUT_ACCEPTING = [/\bsem aceitar\b/i, /\bwithout accepting\b/i, /\bsin aceptar\b/i, /\bsans accepter\b/i, /\bohne zu akzeptieren\b/i];

const helpers = { clickSafely, isVisible, labelOf, waitFor, readTcfConsent };

handleConsentBanner();

async function handleConsentBanner() {
  const match = await waitFor(findBanner, BANNER_WAIT_MS);
  if (!match) {
    return; // No supported banner on this page.
  }
  const { rule } = match;
  const savedBefore = (await rule.readConsent(helpers))?.raw;
  const result = await rule.reject(helpers);
  if (!result.done) {
    const summary = `${rule.name} banner left alone: ${result.reason}`;
    console.warn(`Migalhas: ${summary}.`);
    notifyToolbar("left-alone", summary);
    return;
  }
  const consent = await waitFor(async () => {
    const saved = await rule.readConsent(helpers);
    return saved && saved.raw !== savedBefore ? saved : null;
  }, CONSENT_WAIT_MS);
  reportResult(rule, result.steps, consent);
}

function findBanner() {
  for (const rule of globalThis.migalhasRules ?? []) {
    const banner = rule.findBanner();
    if (isVisible(banner)) {
      return { rule, banner };
    }
  }
  return null;
}

// Logs the result in the page console and shows it on the toolbar icon.
function reportResult(rule, steps, consent) {
  const clicked = steps.map((step) => `"${step}"`).join(" → ");
  if (!consent) {
    const summary = `${rule.name}: clicked ${clicked}, but the site saved no new choice`;
    console.warn(`Migalhas: ${summary}.`);
    notifyToolbar("left-alone", summary);
  } else if (consent.necessaryOnly) {
    console.info(`Migalhas: ${rule.name} banner rejected (${clicked}). Saved: necessary cookies only.`);
    if (consent.note) {
      console.warn(`Migalhas: ${rule.name}: ${consent.note}.`);
    }
    const note = consent.note ? `. Note: ${consent.note}` : "";
    notifyToolbar("rejected", `${rule.name} banner rejected, necessary cookies only${note}`);
  } else {
    const summary = `${rule.name} saved more than necessary cookies (${consent.details}) after ${clicked}`;
    console.error(`Migalhas: ${summary}.`);
    notifyToolbar("failed", summary);
  }
}

function notifyToolbar(status, summary) {
  try {
    chrome.runtime.sendMessage({ type: "banner-result", status, summary }).catch(() => {});
  } catch {
    // Not running inside the installed extension (e.g. the real-sites test), or the extension was reloaded.
  }
}

// Clicks the element unless its label looks like an accept button. Returns true when it clicked.
function clickSafely(element) {
  const label = labelOf(element);
  if (isAcceptLabel(label)) {
    console.warn(`Migalhas: refused to click "${label}": it looks like an accept button.`);
    return false;
  }
  element.click();
  return true;
}

function isAcceptLabel(label) {
  if (WITHOUT_ACCEPTING.some((pattern) => pattern.test(label))) {
    return false;
  }
  return ACCEPT_LABELS.some((pattern) => pattern.test(label));
}

// The text a person sees or hears for the element (a checkbox's value "on" is not a label).
function labelOf(element) {
  const parts = [element.textContent, element.getAttribute("aria-label"), element.title];
  if (element.type !== "checkbox") {
    parts.push(element.value);
  }
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  if (!element) {
    return false;
  }
  const { width, height } = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return width > 0 && height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

// Reads the choice saved by any IAB TCF consent platform through its standard API (__tcfapi).
// Purposes accepted by consent count as "more than necessary"; purposes the site still uses on the
// basis of "legitimate interest" are reported as a note, since banners don't always let us object.
async function readTcfConsent() {
  const data = await callTcfApi("getTCData");
  if (!data?.tcString) {
    return null;
  }
  const allowed = [
    ...enabledKeys(data.purpose?.consents).map((id) => `purpose ${id}`),
    ...enabledKeys(data.specialFeatureOptins).map((id) => `special feature ${id}`),
  ];
  const vendors = enabledKeys(data.vendor?.consents).length;
  if (vendors > 0) {
    allowed.push(`${vendors} vendors`);
  }
  const legitimateInterest = enabledKeys(data.purpose?.legitimateInterests);
  return {
    raw: data.tcString,
    necessaryOnly: allowed.length === 0,
    details: allowed.length > 0 ? `${allowed.join(", ")} allowed` : "necessary only",
    note:
      legitimateInterest.length > 0
        ? `the site still uses "legitimate interest" (no consent) for purposes ${legitimateInterest.join(", ")}`
        : null,
  };
}

function enabledKeys(map) {
  return Object.keys(map ?? {}).filter((key) => map[key]);
}

// Content scripts can't call page functions, so use the TCF postMessage protocol instead.
function callTcfApi(command) {
  return new Promise((resolve) => {
    const callId = `migalhas-${Date.now()}-${Math.random()}`;
    const timer = setTimeout(() => finish(null), TCF_TIMEOUT_MS);
    function onMessage(event) {
      const message = typeof event.data === "string" ? parseJson(event.data) : event.data;
      const reply = message?.__tcfapiReturn;
      if (reply?.callId === callId) {
        finish(reply.success ? reply.returnValue : null);
      }
    }
    function finish(value) {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ __tcfapiCall: { command, version: 2, callId } }, "*");
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Polls fn (which may be async) until it returns a truthy value; returns null after timeoutMs.
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return null;
}
