// Invio email di notifica via Resend (REST API, nessuna dipendenza esterna).
// Richiede RESEND_API_KEY. Mittente in BOOKING_FROM, proprietari in OWNER_EMAILS.

const DEFAULT_OWNERS = "francescofmarzo@libero.it, vacanze@villamartius.it";
const DEFAULT_FROM = "Villa Martius <vacanze@villamartius.it>";

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function fmtIT(iso) {
  const p = String(iso).split("-");
  if (p.length !== 3) return iso;
  const mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  return parseInt(p[2], 10) + " " + mesi[parseInt(p[1], 10) - 1] + " " + p[0];
}
function extraRows(extra) {
  if (!extra || !extra.length) return "";
  const items = extra.map((g) => "<li>" + esc(`${g.nome} ${g.cognome}`.trim()) + "</li>").join("");
  return `<p style="margin:.4rem 0 0"><strong>Altri ospiti:</strong></p><ul style="margin:.2rem 0">${items}</ul>`;
}

function stayBlock(d, reference) {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:15px;color:#1F1611">
      <tr><td style="padding:6px 0;color:#6E5D48">Codice</td><td style="padding:6px 0;text-align:right"><strong>${esc(reference)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6E5D48">Sistemazione</td><td style="padding:6px 0;text-align:right">${esc(d.unitName)}</td></tr>
      <tr><td style="padding:6px 0;color:#6E5D48">Arrivo</td><td style="padding:6px 0;text-align:right">${esc(fmtIT(d.arrivo))}</td></tr>
      <tr><td style="padding:6px 0;color:#6E5D48">Partenza</td><td style="padding:6px 0;text-align:right">${esc(fmtIT(d.partenza))}</td></tr>
      <tr><td style="padding:6px 0;color:#6E5D48">Notti</td><td style="padding:6px 0;text-align:right">${d.nights}</td></tr>
      <tr><td style="padding:6px 0;color:#6E5D48">Ospiti</td><td style="padding:6px 0;text-align:right">${d.ospiti}</td></tr>
    </table>`;
}

function shell(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#F0EBE3;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:28px 16px">
      <h1 style="font-size:22px;color:#1F1611;font-weight:600;margin:0 0 4px">Villa Martius</h1>
      <div style="height:2px;width:44px;background:#9F876A;margin:0 0 18px"></div>
      <div style="background:#fff;border-radius:14px;padding:22px">
        <h2 style="font-size:19px;color:#1F1611;margin:0 0 14px">${title}</h2>
        ${inner}
      </div>
      <p style="color:#6E5D48;font-size:12px;margin:16px 4px 0">Villa Martius · Contrada Pirrera, San Pier Niceto (ME) · Sicilia</p>
    </div>
  </body></html>`;
}

function clientHtml(d, reference) {
  return shell("Prenotazione ricevuta", `
    <p style="color:#1F1611;font-size:15px;margin:0 0 14px">Gentile ${esc(d.mp.nome)}, abbiamo ricevuto la tua prenotazione. Ecco il riepilogo:</p>
    ${stayBlock(d, reference)}
    <p style="color:#1F1611;font-size:15px;margin:16px 0 0"><strong>Pagamento in struttura:</strong> non è richiesto alcun pagamento online, salderai direttamente all'arrivo.</p>
    ${d.note ? `<p style="color:#6E5D48;font-size:14px;margin:12px 0 0"><strong>Le tue note:</strong> ${esc(d.note)}</p>` : ""}
    <p style="color:#6E5D48;font-size:14px;margin:16px 0 0">Per qualsiasi necessità rispondi a questa email o scrivici a vacanze@villamartius.it.</p>`);
}

function ownerHtml(d, reference) {
  return shell("Nuova prenotazione dal sito", `
    ${stayBlock(d, reference)}
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
    <p style="margin:0 0 4px;color:#1F1611;font-size:15px"><strong>Ospite principale</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1F1611">
      <tr><td style="padding:4px 0;color:#6E5D48">Nome</td><td style="padding:4px 0;text-align:right">${esc(d.mp.nome)} ${esc(d.mp.cognome)}</td></tr>
      <tr><td style="padding:4px 0;color:#6E5D48">Email</td><td style="padding:4px 0;text-align:right">${esc(d.mp.email)}</td></tr>
      <tr><td style="padding:4px 0;color:#6E5D48">Telefono</td><td style="padding:4px 0;text-align:right">${esc(d.mp.telefono)}</td></tr>
      <tr><td style="padding:4px 0;color:#6E5D48">Residenza</td><td style="padding:4px 0;text-align:right">${esc([d.mp.citta, d.mp.paese].filter(Boolean).join(", "))}</td></tr>
      ${d.arrivo_ora ? `<tr><td style="padding:4px 0;color:#6E5D48">Arrivo stimato</td><td style="padding:4px 0;text-align:right">${esc(d.arrivo_ora)}</td></tr>` : ""}
    </table>
    ${extraRows(d.extra)}
    ${d.note ? `<p style="color:#6E5D48;font-size:14px;margin:12px 0 0"><strong>Note:</strong> ${esc(d.note)}</p>` : ""}`);
}

async function send(key, payload) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()));
}

export async function sendBookingEmails(d, reference) {
  const key = Netlify.env.get("RESEND_API_KEY");
  if (!key) { console.warn("[email] RESEND_API_KEY mancante — invio saltato"); return; }
  const from = Netlify.env.get("BOOKING_FROM") || DEFAULT_FROM;
  const owners = (Netlify.env.get("OWNER_EMAILS") || DEFAULT_OWNERS)
    .split(",").map((x) => x.trim()).filter(Boolean);

  // Email al cliente.
  await send(key, {
    from,
    to: [d.mp.email],
    subject: `La tua prenotazione a Villa Martius — ${reference}`,
    html: clientHtml(d, reference)
  });

  // Email ai proprietari (entrambi).
  await send(key, {
    from,
    to: owners,
    reply_to: d.mp.email,
    subject: `Nuova prenotazione ${reference} — ${d.unitName}`,
    html: ownerHtml(d, reference)
  });
}
