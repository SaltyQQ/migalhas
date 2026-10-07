// Rule for OneTrust. The element ids and classes are the same on every site that uses it.
// Flow: click "Reject all" on the first screen if it is there. Otherwise open the preference centre,
// switch off every optional category, then click its "Reject all", or "Confirm my choices" when
// there is no reject button.
// Checked on ikea.com/pt (2026-10): "Rejeitar todos os cookies" is on the first screen, and the
// categories are numbered 1-4 (1 = strictly necessary) instead of the usual C0001-C0004.

(() => {
  const BANNER = "onetrust-banner-sdk";
  const PREFERENCE_CENTRE = "onetrust-pc-sdk";
  const FIRST_SCREEN_REJECT = "#onetrust-reject-all-handler";
  const SETTINGS = "#onetrust-pc-btn-handler";
  const CENTRE_REJECT = "#onetrust-pc-sdk .ot-pc-refuse-all-handler";
  const CENTRE_SAVE = "#onetrust-pc-sdk .save-preference-btn-handler";
  const CATEGORY_SWITCHES = "#onetrust-pc-sdk input.category-switch-handler";
  // Strictly necessary groups, used only when the preference centre has no switches to tell.
  const NECESSARY_GROUPS = ["C0001", "1"];
  const SETTINGS_WAIT_MS = 3000;

  (globalThis.migalhasRules ??= []).push({ name: "OneTrust", findBanner, reject, readConsent });

  // Some sites show the preference centre straight away instead of the banner.
  function findBanner() {
    const banner = document.getElementById(BANNER);
    return banner && banner.getBoundingClientRect().width > 0 ? banner : document.getElementById(PREFERENCE_CENTRE);
  }

  async function reject({ clickSafely, isVisible, labelOf, waitFor }) {
    const steps = [];
    const find = (selector) => [...document.querySelectorAll(selector)].find(isVisible) ?? null;
    const click = (element, step = labelOf(element)) => {
      if (!clickSafely(element)) {
        return false;
      }
      steps.push(step);
      return true;
    };

    const firstScreenReject = find(FIRST_SCREEN_REJECT);
    if (firstScreenReject) {
      return click(firstScreenReject)
        ? { done: true, steps }
        : { done: false, reason: "the reject button looks like an accept button" };
    }

    if (!find(CENTRE_REJECT) && !find(CENTRE_SAVE)) {
      const settings = find(SETTINGS);
      if (!settings) {
        return { done: false, reason: "no reject button and no settings button" };
      }
      if (!click(settings)) {
        return { done: false, reason: "the settings button looks like an accept button" };
      }
      await waitFor(() => find(CENTRE_REJECT) ?? find(CENTRE_SAVE), SETTINGS_WAIT_MS);
    }

    switchOffOptionalCategories(click);

    const finalButton = find(CENTRE_REJECT) ?? find(CENTRE_SAVE);
    if (!finalButton) {
      return { done: false, reason: "no reject or save button in the preference centre" };
    }
    if (!click(finalButton)) {
      return { done: false, reason: "the reject button looks like an accept button" };
    }
    return { done: true, steps };
  }

  function switchOffOptionalCategories(click) {
    for (const box of document.querySelectorAll(CATEGORY_SWITCHES)) {
      if (box.checked && !box.disabled) {
        click(box, `switch off ${box.getAttribute("aria-label") || box.id}`);
      }
    }
  }

  // OneTrust saves the choice in the OptanonConsent cookie (…&groups=1:1,2:0,3:0,4:0&…) and sets
  // OptanonAlertBoxClosed once a choice was made.
  function readConsent() {
    if (!readCookie("OptanonAlertBoxClosed")) {
      return null;
    }
    const raw = readCookie("OptanonConsent");
    const groups = raw && new URLSearchParams(raw).get("groups");
    if (!groups) {
      return null;
    }
    const isOptional = optionalGroupTest();
    const allowed = groups
      .split(",")
      .map((entry) => entry.split(":"))
      .filter(([id, on]) => on === "1" && isOptional(id))
      .map(([id]) => id);
    return {
      raw,
      necessaryOnly: allowed.length === 0,
      details: allowed.length > 0 ? `groups ${allowed.join(", ")} allowed` : "necessary only",
    };
  }

  // Optional groups are the ones with a switch in the preference centre; "always active" ones have none.
  function optionalGroupTest() {
    const switchable = [...document.querySelectorAll(CATEGORY_SWITCHES)].map(
      (box) => box.getAttribute("data-optanon-group-id") ?? box.id.replace("ot-group-id-", ""),
    );
    return switchable.length > 0 ? (id) => switchable.includes(id) : (id) => !NECESSARY_GROUPS.includes(id);
  }

  function readCookie(name) {
    const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${name}=`));
    return entry ? entry.slice(name.length + 1) : null;
  }
})();
