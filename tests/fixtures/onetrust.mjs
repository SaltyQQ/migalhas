// Local copy of a OneTrust banner, built from the one on ikea.com/pt (2026-10): "Rejeitar todos os cookies"
// on the first screen, a preference centre with switches for groups 2-4 (group 1 is always active).
// It saves the choice in the OptanonConsent and OptanonAlertBoxClosed cookies like OneTrust does, and
// records every click in window.__clicks (id, or first class when there is no id).

export function oneTrustPage({
  rejectOnFirstScreen = true,
  hasSettings = true,
  centreHasReject = true,
  checked = [],
  rejectLabel = "Rejeitar todos os cookies",
} = {}) {
  const switches = ["2", "3", "4"]
    .map(
      (group) =>
        `<input type="checkbox" id="ot-group-id-${group}" class="category-switch-handler" data-optanon-group-id="${group}"${checked.includes(group) ? " checked" : ""}>`,
    )
    .join("");

  return `<!doctype html>
<title>OneTrust fixture</title>
<div id="onetrust-consent-sdk">
  <div id="onetrust-banner-sdk" style="position: fixed; left: 0; right: 0; bottom: 0; padding: 20px; background: #fff">
    <p>Utilizamos cookies…</p>
    <button id="onetrust-accept-btn-handler">Aceitar todos os cookies</button>
    <button id="onetrust-reject-all-handler"${rejectOnFirstScreen ? "" : " hidden"}>${rejectLabel}</button>
    <button id="onetrust-pc-btn-handler"${hasSettings ? "" : " hidden"}>Definições de cookies</button>
  </div>
  <div id="onetrust-pc-sdk" hidden style="position: fixed; inset: 20px; padding: 20px; background: #fff">
    <button id="accept-recommended-btn-handler">Aceitar todos os cookies</button>
    <p>Estritamente necessários: Sempre ativos</p>
    ${switches}
    <button class="ot-pc-refuse-all-handler"${centreHasReject ? "" : " hidden"}>Rejeitar todos os cookies</button>
    <button class="save-preference-btn-handler onetrust-close-btn-handler">Confirmar as minhas escolhas</button>
  </div>
</div>
<script>
  window.__clicks = [];
  const root = document.getElementById("onetrust-consent-sdk");
  const byId = (id) => document.getElementById(id);
  const state = (group) => (byId("ot-group-id-" + group).checked ? 1 : 0);
  root.addEventListener("click", (event) => {
    const name = event.target.id || event.target.classList[0];
    if (name) window.__clicks.push(name);
  });

  function save(groups) {
    document.cookie = "OptanonConsent=isGpcEnabled=0&version=202603.1.0&groups=" + encodeURIComponent(groups) + "; path=/";
    document.cookie = "OptanonAlertBoxClosed=" + new Date().toISOString() + "; path=/";
    root.hidden = true;
  }

  byId("onetrust-pc-btn-handler").onclick = () => {
    byId("onetrust-pc-sdk").hidden = false;
    byId("onetrust-banner-sdk").hidden = true;
  };
  byId("onetrust-accept-btn-handler").onclick = () => save("1:1,2:1,3:1,4:1");
  byId("accept-recommended-btn-handler").onclick = () => save("1:1,2:1,3:1,4:1");
  byId("onetrust-reject-all-handler").onclick = () => save("1:1,2:0,3:0,4:0");
  document.querySelector(".ot-pc-refuse-all-handler").onclick = () => save("1:1,2:0,3:0,4:0");
  document.querySelector(".save-preference-btn-handler").onclick = () =>
    save("1:1,2:" + state(2) + ",3:" + state(3) + ",4:" + state(4));
</script>`;
}
