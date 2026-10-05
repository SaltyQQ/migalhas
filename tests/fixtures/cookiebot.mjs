// Local copy of a Cookiebot banner, built from the one on continente.pt (2026-10): the first screen shows
// "Personalizar" and "Permitir todos"; "Rejeitar todos" only appears after "Personalizar".
// It saves the choice in the CookieConsent cookie like Cookiebot does, and records every click in
// window.__clicks so tests can check that "Permitir todos" was never clicked.

export function cookiebotPage({
  declineOnFirstScreen = false,
  hasDecline = true,
  hasSettings = true,
  checked = [],
  declineLabel = "Rejeitar todos",
} = {}) {
  const switches = ["Preferences", "Statistics", "Marketing"]
    .map((name) => `<input type="checkbox" id="CybotCookiebotDialogBodyLevelButton${name}Inline"${checked.includes(name) ? " checked" : ""}>`)
    .join("");

  return `<!doctype html>
<title>Cookiebot fixture</title>
<div id="CybotCookiebotDialog" style="position: fixed; inset: 20px; padding: 20px; background: #fff">
  <p>Utilizamos cookies…</p>
  <button id="CybotCookiebotDialogBodyLevelButtonCustomize"${hasSettings ? "" : " hidden"}>Personalizar</button>
  <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll">Permitir todos</button>
  <div id="details" hidden>
    <input type="checkbox" id="CybotCookiebotDialogBodyLevelButtonNecessaryInline" checked disabled>
    ${switches}
    <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection">Confirmar</button>
  </div>
  <button id="CybotCookiebotDialogBodyButtonDecline"${declineOnFirstScreen ? "" : " hidden"}>${declineLabel}</button>
</div>
<script>
  window.__clicks = [];
  const dialog = document.getElementById("CybotCookiebotDialog");
  const byId = (id) => document.getElementById(id);
  const isOn = (name) => byId("CybotCookiebotDialogBodyLevelButton" + name + "Inline").checked;
  dialog.addEventListener("click", (event) => event.target.id && window.__clicks.push(event.target.id));

  function save(preferences, statistics, marketing) {
    const value = "{stamp:'fixture',necessary:true,preferences:" + preferences + ",statistics:" + statistics +
      ",marketing:" + marketing + ",method:'explicit',ver:4,utc:1,region:'pt'}";
    document.cookie = "CookieConsent=" + encodeURIComponent(value) + "; path=/";
    dialog.hidden = true;
  }

  byId("CybotCookiebotDialogBodyLevelButtonCustomize").onclick = () => {
    byId("details").hidden = false;
    byId("CybotCookiebotDialogBodyLevelButtonCustomize").hidden = true;
    byId("CybotCookiebotDialogBodyButtonDecline").hidden = !${hasDecline};
  };
  byId("CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll").onclick = () => save(true, true, true);
  byId("CybotCookiebotDialogBodyButtonDecline").onclick = () => save(false, false, false);
  byId("CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection").onclick = () =>
    save(isOn("Preferences"), isOn("Statistics"), isOn("Marketing"));
</script>`;
}
