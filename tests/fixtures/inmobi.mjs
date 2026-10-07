// Local copy of an InMobi Choice banner, built from the one on sapo.pt (2026-10): the first screen shows
// "MAIS OPÇÕES" and "ACEITAR"; "REJEITAR TODOS" is on the next screen. Buttons have no ids on the real
// banner (only mode="primary|secondary|link"); the ids here are only for recording clicks in window.__clicks.
// A fake TCF API answers both __tcfapi() and the postMessage protocol, like the real one. As on sapo.pt,
// some purposes stay on "legitimate interest" after rejecting.

export function inMobiPage({
  rejectOnFirstScreen = false,
  rejectSaves = true,
  hasMoreOptions = true,
  legitimateInterest = ["2", "7"],
} = {}) {
  return `<!doctype html>
<title>InMobi Choice fixture</title>
<div id="qc-cmp2-container">
  <div id="qc-cmp2-ui" style="position: fixed; inset: 20px; padding: 20px; background: #fff">
    <div id="summary">
      <p>Damos valor à sua privacidade</p>
      <button mode="secondary" id="more"${hasMoreOptions ? "" : " hidden"}>MAIS OPÇÕES</button>
      <button mode="secondary" id="reject-first"${rejectOnFirstScreen ? "" : " hidden"}>REJEITAR</button>
      <button mode="primary" id="accept">ACEITAR</button>
    </div>
    <div id="details" hidden>
      <button mode="link" id="reject-all">REJEITAR TODOS</button>
      <button mode="link" id="accept-all">ACEITAR TODOS</button>
      <button mode="primary" id="save">GRAVAR</button>
    </div>
  </div>
</div>
<script>
  window.__clicks = [];
  const byId = (id) => document.getElementById(id);
  const PURPOSES = ["1", "2", "3", "4", "7"];
  let saved = null;
  byId("qc-cmp2-container").addEventListener("click", (event) => event.target.id && window.__clicks.push(event.target.id));

  function save(accept) {
    saved = { tcString: "fixture-" + Date.now(), consents: accept ? PURPOSES : [], vendors: accept ? 3 : 0 };
    byId("qc-cmp2-ui").hidden = true;
  }

  function tcData() {
    const map = (ids) => Object.fromEntries(PURPOSES.map((id) => [id, ids.includes(id)]));
    const vendorCount = saved ? saved.vendors : 0;
    return {
      eventStatus: saved ? "useractioncomplete" : "cmpuishown",
      tcString: saved ? saved.tcString : "",
      purpose: { consents: map(saved ? saved.consents : []), legitimateInterests: map(saved ? ${JSON.stringify(legitimateInterest)} : []) },
      specialFeatureOptins: {},
      vendor: { consents: Object.fromEntries(Array.from({ length: vendorCount }, (_, i) => [String(i + 1), true])), legitimateInterests: {} },
    };
  }

  window.__tcfapi = (command, version, callback) => callback(tcData(), true);
  window.addEventListener("message", (event) => {
    const call = event.data && event.data.__tcfapiCall;
    if (call) event.source.postMessage({ __tcfapiReturn: { returnValue: tcData(), success: true, callId: call.callId } }, "*");
  });

  byId("more").onclick = () => {
    byId("summary").hidden = true;
    byId("details").hidden = false;
  };
  byId("reject-first").onclick = () => save(false);
  byId("accept").onclick = () => save(true);
  byId("accept-all").onclick = () => save(true);
  byId("reject-all").onclick = () => ${rejectSaves} && save(false);
  byId("save").onclick = () => save(false);
</script>`;
}
