// Rule for Cookiebot (by Usercentrics). The element ids are the same on every site that uses it.
// Flow: click "Reject all" if it is visible. Otherwise open the settings, switch off every optional
// category, then click "Reject all", or save the selection when there is no reject button.
// Checked on continente.pt (2026-10): the first screen only shows "Personalizar" and "Permitir todos";
// "Rejeitar todos" appears after "Personalizar".

(() => {
  const DECLINE = "CybotCookiebotDialogBodyButtonDecline";
  const SAVE_SELECTION = "CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection";
  const SETTINGS = [
    "CybotCookiebotDialogBodyLevelButtonCustomize",
    "CybotCookiebotDialogBodyEdgeMoreDetailsLink",
    "CybotCookiebotDialogNavDetails",
  ];
  const OPTIONAL_CATEGORIES = ["Preferences", "Statistics", "Marketing"];
  // The first screen and the settings each have their own copy of the category switches.
  const CATEGORY_SWITCHES = OPTIONAL_CATEGORIES.flatMap((name) => [
    `CybotCookiebotDialogBodyLevelButton${name}`,
    `CybotCookiebotDialogBodyLevelButton${name}Inline`,
  ]);
  const SETTINGS_WAIT_MS = 3000;

  (globalThis.migalhasRules ??= []).push({
    name: "Cookiebot",
    findBanner: () => document.getElementById("CybotCookiebotDialog"),
    reject,
    readConsent,
  });

  async function reject({ clickSafely, isVisible, labelOf, waitFor }) {
    const steps = [];
    const find = (id) => {
      const element = document.getElementById(id);
      return isVisible(element) ? element : null;
    };
    const click = (element, step = labelOf(element)) => {
      if (!clickSafely(element)) {
        return false;
      }
      steps.push(step);
      return true;
    };

    if (!find(DECLINE)) {
      const settings = SETTINGS.map(find).find(Boolean);
      if (!settings) {
        return { done: false, reason: "no reject button and no settings button" };
      }
      if (!click(settings)) {
        return { done: false, reason: "the settings button looks like an accept button" };
      }
      await waitFor(() => find(DECLINE) ?? find(SAVE_SELECTION), SETTINGS_WAIT_MS);
    }

    switchOffOptionalCategories(find, click);

    const finalButton = find(DECLINE) ?? find(SAVE_SELECTION);
    if (!finalButton) {
      return { done: false, reason: "no reject or save button in the settings" };
    }
    if (!click(finalButton)) {
      return { done: false, reason: "the reject button looks like an accept button" };
    }
    return { done: true, steps };
  }

  function switchOffOptionalCategories(find, click) {
    for (const id of CATEGORY_SWITCHES) {
      const box = find(id);
      if (box?.checked && !box.disabled) {
        const category = id.replace("CybotCookiebotDialogBodyLevelButton", "").replace("Inline", "");
        click(box, `switch off ${category}`);
      }
    }
  }

  // Cookiebot saves the choice in the CookieConsent cookie, e.g.
  // {stamp:'…',necessary:true,preferences:false,statistics:false,marketing:false,method:'explicit',…}
  function readConsent() {
    const cookie = document.cookie.split("; ").find((entry) => entry.startsWith("CookieConsent="));
    if (!cookie) {
      return null;
    }
    let raw;
    try {
      raw = decodeURIComponent(cookie.slice("CookieConsent=".length));
    } catch {
      return null;
    }
    if (!raw.includes("necessary:")) {
      return null;
    }
    const allowed = OPTIONAL_CATEGORIES.map((name) => name.toLowerCase()).filter((name) => raw.includes(`${name}:true`));
    return {
      raw,
      necessaryOnly: allowed.length === 0,
      details: allowed.length > 0 ? `${allowed.join(", ")} allowed` : "necessary only",
    };
  }
})();
