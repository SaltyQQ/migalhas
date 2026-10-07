// Rule for InMobi Choice (formerly Quantcast Choice), an IAB TCF consent platform. Its buttons have no
// ids, only a "mode" attribute (primary, secondary, link), so reject buttons are recognised by their text.
// Flow: "Reject" on the first screen if there is one; otherwise "More options", then "Reject all".
// If the banner stays open, save with its main button (clickSafely refuses it if it says "Accept").
// Checked on sapo.pt (2026-10): the first screen shows "MAIS OPÇÕES" and "ACEITAR"; "REJEITAR TODOS"
// on the next screen saves and closes. The choice is read through the standard TCF API.

(() => {
  const ROOT = "qc-cmp2-container";
  const REJECT_WORDS = /\b(rejeitar|recusar|reject|decline|disagree|refuser|ablehnen|rechazar|rifiuta)/i;
  const SETTINGS_WAIT_MS = 3000;
  const CLOSE_WAIT_MS = 1500;

  (globalThis.migalhasRules ??= []).push({
    name: "InMobi Choice",
    // The container itself has no size; its main button shows whether the banner is on screen.
    findBanner: () => document.getElementById(ROOT)?.querySelector('button[mode="primary"]') ?? null,
    reject,
    readConsent: ({ readTcfConsent }) => readTcfConsent(),
  });

  async function reject({ clickSafely, isVisible, labelOf, waitFor }) {
    const steps = [];
    const root = document.getElementById(ROOT);
    const buttons = (mode) => [...root.querySelectorAll(`button[mode="${mode}"]`)].filter(isVisible);
    const isReject = (button) => REJECT_WORDS.test(labelOf(button));
    const click = (element) => {
      if (!clickSafely(element)) {
        return false;
      }
      steps.push(labelOf(element));
      return true;
    };

    let rejectButton = buttons("secondary").find(isReject);
    if (!rejectButton) {
      const moreOptions = buttons("secondary").find((button) => !isReject(button));
      if (!moreOptions) {
        return { done: false, reason: "no reject button and no more-options button" };
      }
      if (!click(moreOptions)) {
        return { done: false, reason: "the more-options button looks like an accept button" };
      }
      rejectButton = await waitFor(() => buttons("link").find(isReject), SETTINGS_WAIT_MS);
      if (!rejectButton) {
        return { done: false, reason: "no reject button after more options" };
      }
    }
    if (!click(rejectButton)) {
      return { done: false, reason: "the reject button looks like an accept button" };
    }

    // On some sites "Reject all" only switches everything off; the choice still has to be saved.
    const closed = await waitFor(() => buttons("primary").length === 0, CLOSE_WAIT_MS);
    const save = buttons("primary")[0];
    if (!closed && save && !click(save)) {
      return { done: false, reason: "the save button looks like an accept button" };
    }
    return { done: true, steps };
  }
})();
