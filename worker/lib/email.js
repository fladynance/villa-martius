// Invio email di notifica via Resend (REST API, nessuna dipendenza esterna).
// Template eleganti con logo. Richiede RESEND_API_KEY. Mittente in BOOKING_FROM.

const DEFAULT_OWNERS = "francescofmarzo@libero.it, vacanze@villamartius.it";
const DEFAULT_FROM = "Villa Martius <vacanze@villamartius.it>";
const LOGO_URL = "https://villa-martius.francescofmarzo.workers.dev/assets/img/logo.png";
const SITE_URL = "https://villa-martius.francescofmarzo.workers.dev";

const C = {
  espresso: "#241C15", ink: "#2A211A", gold: "#A98B5D", goldSoft: "#C6AE86",
  cream: "#FBF7F0", paper: "#FFFFFF", muted: "#8A7B67", line: "#E8E0D2",
  green: "#335C4B", greenBg: "#EEF3EF"
};

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtIT(iso) {
  const p = String(iso).split("-");
  if (p.length !== 3) return esc(iso);
  const g = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const m = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const d = new Date(iso + "T00:00:00");
  return `${g[d.getDay()]} ${parseInt(p[2], 10)} ${m[parseInt(p[1], 10) - 1]} ${p[0]}`;
}

function row(label, value, strong) {
  return `<tr>
    <td style="padding:9px 0;border-top:1px solid ${C.line};font:14px Arial,Helvetica,sans-serif;color:${C.muted}">${esc(label)}</td>
    <td style="padding:9px 0;border-top:1px solid ${C.line};font:${strong ? "700" : "400"} 14px Arial,Helvetica,sans-serif;color:${C.ink};text-align:right">${value}</td>
  </tr>`;
}

function stayTable(d, reference) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0">
    ${row("Codice prenotazione", `<span style="letter-spacing:.05em">${esc(reference)}</span>`, true)}
    ${row("Sistemazione", esc(d.unitName), true)}
    ${row("Arrivo", esc(fmtIT(d.arrivo)))}
    ${row("Partenza", esc(fmtIT(d.partenza)))}
    ${row("Notti", String(d.nights))}
    ${row("Ospiti", String(d.ospiti))}
  </table>`;
}

function guestTable(g) {
  const fields = [
    ["Nome", `${g.nome || ""} ${g.cognome || ""}`.trim()],
    ["Email", g.email],
    ["Telefono", g.telefono],
    ["Residenza", [g.citta, g.paese].filter(Boolean).join(", ")]
  ].filter(([, v]) => v);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${fields.map(([l, v]) => `<tr>
      <td style="padding:5px 0;font:13px Arial,Helvetica,sans-serif;color:${C.muted};width:38%">${esc(l)}</td>
      <td style="padding:5px 0;font:600 13px Arial,Helvetica,sans-serif;color:${C.ink}">${esc(v)}</td>
    </tr>`).join("")}
  </table>`;
}

function shell(preheader, inner) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
  <body style="margin:0;padding:0;background:${C.cream};-webkit-text-size-adjust:100%">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream}">
      <tr><td align="center" style="padding:28px 14px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;border-collapse:collapse">

          <!-- Header -->
          <tr><td style="background:${C.espresso};padding:30px 24px 22px;text-align:center;border-radius:16px 16px 0 0">
            <img src="${LOGO_URL}" alt="Villa Martius" width="156" style="display:block;margin:0 auto;width:156px;max-width:60%;height:auto">
          </td></tr>
          <tr><td style="height:3px;background:${C.gold};line-height:3px;font-size:0">&nbsp;</td></tr>

          <!-- Body -->
          <tr><td style="background:${C.paper};padding:34px 30px 30px">
            ${inner}
          </td></tr>

          <!-- Footer -->
          <tr><td style="background:${C.espresso};padding:22px 24px;text-align:center;border-radius:0 0 16px 16px">
            <p style="margin:0;font:12px Arial,Helvetica,sans-serif;color:${C.goldSoft};letter-spacing:.12em;text-transform:uppercase">Villa Martius</p>
            <p style="margin:6px 0 0;font:12px Arial,Helvetica,sans-serif;color:#C9BCA8;line-height:1.6">Contrada Pirrera · 98045 San Pier Niceto (ME) · Sicilia<br>
              <a href="tel:+393315309082" style="color:#C9BCA8;text-decoration:none">331 530 9082</a> ·
              <a href="mailto:vacanze@villamartius.it" style="color:#C9BCA8;text-decoration:none">vacanze@villamartius.it</a></p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  </body></html>`;
}

export function clientEmailHtml(d, reference) {
  const inner = `
    <h1 style="margin:0 0 6px;font:400 26px Georgia,'Times New Roman',serif;color:${C.ink}">Prenotazione ricevuta</h1>
    <p style="margin:0 0 20px;font:15px Arial,Helvetica,sans-serif;color:${C.muted};line-height:1.6">
      Gentile ${esc(d.mp.nome)}, grazie per aver scelto Villa Martius. Abbiamo registrato la tua richiesta: qui sotto trovi il riepilogo.</p>

    <div style="background:${C.cream};border:1px solid ${C.line};border-radius:12px;padding:18px 20px;margin:0 0 20px">
      ${stayTable(d, reference)}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.greenBg};border-radius:12px;margin:0 0 20px">
      <tr>
        <td style="padding:16px 18px;font:15px Arial,Helvetica,sans-serif;color:${C.green};line-height:1.55">
          <strong>Pagamento in struttura.</strong> Nessun pagamento online: salderai comodamente all'arrivo a Villa Martius.
        </td>
      </tr>
    </table>

    ${d.note ? `<p style="margin:0 0 18px;font:14px Arial,Helvetica,sans-serif;color:${C.muted}"><strong style="color:${C.ink}">Le tue note:</strong> ${esc(d.note)}</p>` : ""}

    <p style="margin:0 0 4px;font:15px Arial,Helvetica,sans-serif;color:${C.muted};line-height:1.6">
      Per qualsiasi necessità rispondi a questa email o scrivici a
      <a href="mailto:vacanze@villamartius.it" style="color:${C.gold}">vacanze@villamartius.it</a>. A presto!</p>

    <p style="margin:22px 0 0;text-align:center">
      <a href="${SITE_URL}" style="display:inline-block;background:${C.espresso};color:#F6ECDC;text-decoration:none;font:600 13px Arial,Helvetica,sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:13px 26px;border-radius:10px">Visita il sito</a>
    </p>`;
  return shell(`Prenotazione ricevuta — ${reference}. Pagamento in struttura.`, inner);
}

export function ownerEmailHtml(d, reference) {
  const extra = (d.extra && d.extra.length)
    ? d.extra.map((g, i) => `
      <p style="margin:16px 0 4px;font:600 13px Arial,Helvetica,sans-serif;color:${C.gold};letter-spacing:.04em;text-transform:uppercase">Ospite ${i + 2}</p>
      ${guestTable(g)}`).join("")
    : `<p style="margin:8px 0 0;font:13px Arial,Helvetica,sans-serif;color:${C.muted}">Nessun ospite aggiuntivo indicato.</p>`;
  const inner = `
    <p style="margin:0 0 4px;font:600 12px Arial,Helvetica,sans-serif;color:${C.gold};letter-spacing:.14em;text-transform:uppercase">Nuova prenotazione dal sito</p>
    <h1 style="margin:0 0 20px;font:400 25px Georgia,'Times New Roman',serif;color:${C.ink}">${esc(d.unitName)}</h1>

    <div style="background:${C.cream};border:1px solid ${C.line};border-radius:12px;padding:18px 20px;margin:0 0 20px">
      ${stayTable(d, reference)}
    </div>

    <p style="margin:0 0 6px;font:600 13px Arial,Helvetica,sans-serif;color:${C.gold};letter-spacing:.04em;text-transform:uppercase">Ospite principale</p>
    ${guestTable(d.mp)}

    ${extra}

    ${d.arrivo_ora ? `<p style="margin:16px 0 0;font:14px Arial,Helvetica,sans-serif;color:${C.ink}"><strong>Arrivo stimato:</strong> ${esc(d.arrivo_ora)}</p>` : ""}
    ${d.note ? `<p style="margin:10px 0 0;font:14px Arial,Helvetica,sans-serif;color:${C.ink}"><strong>Note:</strong> ${esc(d.note)}</p>` : ""}

    <p style="margin:20px 0 0;padding:12px 16px;background:${C.greenBg};border-radius:10px;font:14px Arial,Helvetica,sans-serif;color:${C.green}">
      Pagamento <strong>in struttura</strong>. Contatta l'ospite a
      <a href="mailto:${esc(d.mp.email)}" style="color:${C.green};font-weight:700">${esc(d.mp.email)}</a> per i dettagli.</p>`;
  return shell(`Nuova prenotazione ${reference} — ${d.unitName}`, inner);
}

async function send(key, payload) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()));
}

export async function sendBookingEmails(d, reference, env) {
  const key = env.RESEND_API_KEY;
  if (!key) { console.warn("[email] RESEND_API_KEY mancante — invio saltato"); return; }
  const from = env.BOOKING_FROM || DEFAULT_FROM;
  const owners = (env.OWNER_EMAILS || DEFAULT_OWNERS)
    .split(",").map((x) => x.trim()).filter(Boolean);

  await send(key, {
    from,
    to: [d.mp.email],
    subject: `La tua prenotazione a Villa Martius — ${reference}`,
    html: clientEmailHtml(d, reference)
  });

  await send(key, {
    from,
    to: owners,
    reply_to: d.mp.email,
    subject: `Nuova prenotazione ${reference} — ${d.unitName}`,
    html: ownerEmailHtml(d, reference)
  });
}
