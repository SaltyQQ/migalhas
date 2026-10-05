// Content script: finds a cookie consent banner, rejects everything except strictly necessary cookies,
// then checks what the site saved. Each consent platform (CMP) has its own rule in rules/.
// Safety: clickSafely never clicks a button whose label looks like "Accept" or "Allow all",
// so even a broken rule can't accept cookies.

const BANNER_WAIT_MS = 15000;
const CONSENT_WAIT_MS = 5000;
const POLL_MS = 250;

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

const helpers = { clickSafely, isVisible, labelOf, waitFor };

handleConsentBanner();

async function handleConsentBanner() {
  const match = await waitFor(findBanner, BANNER_WAIT_MS);
  if (!match) {
    return; // No supported banner on this page.
  }
  const { rule } = match;
  const savedBefore = rule.readConsent()?.raw;
  const result = await rule.reject(helpers);
  if (!result.done) {
    console.warn(`Migalhas: ${rule.name} banner left alone: ${result.reason}.`);
    return;
  }
  const consent = await waitFor(() => {
    const saved = rule.readConsent();
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

function reportResult(rule, steps, consent) {
  const clicked = steps.map((step) => `"${step}"`).join(" → ");
  if (!consent) {
    console.warn(`Migalhas: ${rule.name}: clicked ${clicked}, but the site saved no new choice.`);
  } else if (consent.necessaryOnly) {
    console.info(`Migalhas: ${rule.name} banner rejected (${clicked}). Saved: necessary cookies only.`);
  } else {
    console.error(`Migalhas: ${rule.name} saved more than necessary cookies (${consent.details}) after ${clicked}.`);
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

// Polls fn until it returns a truthy value; returns null after timeoutMs.
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return null;
}
