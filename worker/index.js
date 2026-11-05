// Worker Villa Martius: serve il sito statico (binding ASSETS) e il motore di
// prenotazione su /api/*. Database su Cloudflare D1 (binding DB). L'anti-overbooking
// è garantito dall'assegnazione atomica di un'unità libera (INSERT ... SELECT con
// NOT EXISTS sulle date sovrapposte); D1 serializza le scritture, quindi niente race.
import { UNITS } from "./lib/units.js";
import { json } from "./lib/respond.js";
import { validateBooking } from "./lib/validate.js";
import { verifyTurnstile } from "./lib/turnstile.js";
import { sendBookingEmails } from "./lib/email.js";
import { createCalendarEvent } from "./lib/calendar.js";

function genRef() {
  const a = Date.now().toString(36).toUpperCase().slice(-5);
  const b = Math.random().toString(36).toUpperCase().slice(2, 5);
  return "VM-" + a + b;
}

function isDupRef(e) {
  return /UNIQUE constraint|duplicate/i.test(String((e && e.message) || e));
}

// GET /api/availability?unita=...&arrivo=YYYY-MM-DD&partenza=YYYY-MM-DD
async function handleAvailability(req, env) {
  try {
    const u = new URL(req.url);
    const unita = u.searchParams.get("unita");
    const arrivo = u.searchParams.get("arrivo");
    const partenza = u.searchParams.get("partenza");

    if (!UNITS[unita]) return json({ ok: false, message: "Sistemazione non valida." }, 400);
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(arrivo || "") || !re.test(partenza || "")) {
      return json({ ok: false, message: "Date mancanti o non valide." }, 400);
    }
    if (!env.DB) return json({ ok: false, message: "Database non configurato." }, 500);

    // Intervalli semiaperti [check_in, check_out): si sovrappongono se
    // check_in < partenza AND check_out > arrivo.
    const res = await env.DB.prepare(
      `SELECT count(*) AS n FROM units
       WHERE room_type = ?
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.unit_id = units.id
             AND b.status IN ('confermata','in_attesa')
             AND b.check_in < ? AND b.check_out > ?
         )`
    ).bind(unita, partenza, arrivo).all();
    const n = (res.results && res.results[0] && res.results[0].n) || 0;
    return json({ ok: true, available: n > 0, remaining: n });
  } catch (e) {
    console.error("[availability]", e);
    return json({ ok: false, message: "Errore interno." }, 500);
  }
}

// POST /api/create-booking
async function handleCreateBooking(req, env, ctx) {
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, message: "Richiesta non valida." }, 400); }

  // Honeypot: campo nascosto compilato solo dai bot.
  if (body.hp && String(body.hp).trim()) {
    return json({ ok: false, message: "Richiesta non valida." }, 400);
  }
  // Anti-bot Turnstile: verifica solo se è stato prodotto un token (l'honeypot
  // resta comunque attivo); un token presente ma non valido viene rifiutato.
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (body.turnstile) {
    const human = await verifyTurnstile(body.turnstile, ip, env);
    if (!human) return json({ ok: false, message: "Verifica anti-spam non superata. Ricarica la pagina e riprova." }, 400);
  }

  const v = validateBooking(body);
  if (!v.ok) return json({ ok: false, message: v.message }, 400);
  const d = v.data;

  if (!env.DB) return json({ ok: false, message: "Database non configurato." }, 500);

  // Assegnazione atomica di un'unità libera della tipologia: se nessuna è libera
  // per quelle date, l'INSERT ... SELECT non inserisce nulla (0 righe → non disponibile).
  let inserted = null;
  for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
    const reference = genRef();
    try {
      const res = await env.DB.prepare(
        `INSERT INTO bookings (
           reference, unit_id, room_type, check_in, check_out, guests,
           main_nome, main_cognome, main_email, main_telefono, main_paese, main_citta,
           extra_ospiti, arrivo_ora, note
         )
         SELECT ?, u.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM units u
         WHERE u.room_type = ?
           AND NOT EXISTS (
             SELECT 1 FROM bookings b
             WHERE b.unit_id = u.id
               AND b.status IN ('confermata','in_attesa')
               AND b.check_in < ? AND b.check_out > ?
           )
         ORDER BY u.id
         LIMIT 1
         RETURNING id, reference`
      ).bind(
        reference, d.unita, d.arrivo, d.partenza, d.ospiti,
        d.mp.nome, d.mp.cognome, d.mp.email, d.mp.telefono, d.mp.paese, d.mp.citta || null,
        JSON.stringify(d.extra), d.arrivo_ora || null, d.note || null,
        d.unita, d.partenza, d.arrivo
      ).all();

      const rows = res.results || [];
      if (rows.length === 0) {
        return json({ ok: false, reason: "unavailable", message: "Spiacenti, per le date scelte questa sistemazione non è più disponibile." }, 409);
      }
      inserted = { id: rows[0].id, reference: rows[0].reference };
    } catch (e) {
      if (isDupRef(e)) continue; // collisione del codice prenotazione → riprova
      console.error("[create-booking] db", e);
      return json({ ok: false, message: "DEBUG query: " + String((e && e.message) || e) }, 500);
    }
  }
  if (!inserted) {
    return json({ ok: false, reason: "unavailable", message: "Spiacenti, per le date scelte questa sistemazione non è più disponibile." }, 409);
  }

  // Notifiche dopo la risposta: non devono rallentare né far fallire la prenotazione salvata.
  const ref = inserted.reference;
  ctx.waitUntil((async () => {
    try { await sendBookingEmails(d, ref, env); } catch (e) { console.error("[create-booking] email", e); }
    try { await createCalendarEvent(d, ref, env); } catch (e) { console.error("[create-booking] calendar", e); }
  })());

  return json({ ok: true, reference: ref });
}

function clip(v, max) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
  });
}

// Chiave pubblica Web3Forms (access key): è pensata per stare in chiaro nel codice,
// non è un segreto. Web3Forms spedisce da un suo dominio autenticato → arriva anche
// nelle caselle con filtri severi come Libero. Impostala qui per attivare l'invio.
const WEB3FORMS_KEY = "";

// Notifica ai proprietari. Preferisce Brevo (300 email/giorno gratis): quando non
// c'è un dominio proprio, Brevo sostituisce il mittente con un suo dominio già
// autenticato, quindi l'email supera i filtri severi di Libero (SPF -all / DMARC
// quarantine). Senza chiave Brevo ripiega su FormSubmit (best-effort). In ogni
// caso la richiesta resta salvata su D1, quindi non si perde mai nulla.
async function notifyContact(d, env) {
  const to = env.CONTACT_TO || "francescofmarzo@libero.it";
  const rows = [
    ["Nome", d.nome], ["Email", d.email], ["Telefono", d.telefono || "-"],
    ["Data evento", d.data || "-"], ["Ospiti", d.ospiti || "-"],
    ["Tipo evento", d.evento || "-"], ["Messaggio", d.messaggio || "-"]
  ];

  // 1) Web3Forms (chiave pubblica): spedisce dal proprio dominio autenticato,
  //    con Reply-To sul cliente. Nessun segreto da configurare su Cloudflare.
  const w3k = env.WEB3FORMS_KEY || WEB3FORMS_KEY;
  if (w3k) {
    const r = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        access_key: w3k,
        subject: "Nuova richiesta dal sito Villa Martius — " + d.nome,
        from_name: "Villa Martius — Sito",
        replyto: d.email,
        Nome: d.nome, Email: d.email, Telefono: d.telefono || "-",
        "Data evento": d.data || "-", Ospiti: d.ospiti || "-",
        "Tipo evento": d.evento || "-", Messaggio: d.messaggio || "-"
      })
    });
    if (!r.ok) {
      const t = await r.text().catch(function () { return ""; });
      throw new Error("web3forms " + r.status + " " + t.slice(0, 300));
    }
    return;
  }

  // 2) Brevo (chiave segreta su Cloudflare).
  if (env.BREVO_API_KEY) {
    const html =
      '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">' +
      '<h2 style="font-family:Georgia,serif;color:#5A4632;font-weight:normal">Nuova richiesta dal sito Villa Martius</h2>' +
      '<table style="border-collapse:collapse;width:100%;font-size:14px">' +
      rows.map(function (r) {
        return '<tr>' +
          '<td style="padding:8px 12px;background:#F0EBE3;font-weight:bold;white-space:nowrap;vertical-align:top">' + escHtml(r[0]) + '</td>' +
          '<td style="padding:8px 12px;border:1px solid #eee">' + escHtml(r[1]).replace(/\n/g, "<br>") + '</td>' +
          '</tr>';
      }).join("") +
      '</table>' +
      '<p style="color:#8a8a8a;font-size:12px;margin-top:16px">Puoi rispondere direttamente a questa email per scrivere al cliente.</p>' +
      '</div>';

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        sender: { name: "Villa Martius — Sito", email: env.BREVO_SENDER || to },
        to: [{ email: to }],
        replyTo: { email: d.email, name: d.nome },
        subject: "Nuova richiesta dal sito Villa Martius — " + d.nome,
        htmlContent: html
      })
    });
    if (!r.ok) {
      const t = await r.text().catch(function () { return ""; });
      throw new Error("brevo " + r.status + " " + t.slice(0, 300));
    }
    return;
  }

  // Fallback senza configurazione Brevo: FormSubmit.
  await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      _subject: "Nuova richiesta dal sito Villa Martius — " + d.nome,
      _template: "table",
      Nome: d.nome, Email: d.email, Telefono: d.telefono || "-",
      "Data evento": d.data || "-", Ospiti: d.ospiti || "-",
      "Tipo evento": d.evento || "-", Messaggio: d.messaggio || "-"
    })
  });
}

// POST /api/contact — modulo "Contatti". Salva nel DB e notifica i proprietari
// (Brevo se configurato, altrimenti FormSubmit). Nessun Resend, nessun dominio.
async function handleContact(req, env, ctx) {
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, message: "Richiesta non valida." }, 400); }

  // Honeypot invisibile.
  if (body.hp && String(body.hp).trim()) return json({ ok: false, message: "Richiesta non valida." }, 400);

  const nome = clip(body.nome, 120);
  const email = clip(body.email, 160);
  const telefono = clip(body.telefono, 60);
  const data = clip(body.data, 20);
  const ospiti = clip(body.ospiti, 30);
  const evento = clip(body.evento, 60);
  const messaggio = clip(body.messaggio, 3000);

  if (!nome || !email) return json({ ok: false, message: "Inserisci almeno nome ed email." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, message: "Email non valida." }, 400);

  // Salvataggio nel database (fonte di verità: non si perde nulla).
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO contacts (nome, email, telefono, data_evento, ospiti, tipo_evento, messaggio)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(nome, email, telefono || null, data || null, ospiti || null, evento || null, messaggio || null).run();
    } catch (e) { console.error("[contact] db", e); }
  }

  // Notifica ai proprietari dopo la risposta: non deve rallentare né far fallire
  // il salvataggio (la richiesta è già su D1).
  const payload = { nome, email, telefono, data, ospiti, evento, messaggio };
  ctx.waitUntil((async () => {
    try { await notifyContact(payload, env); }
    catch (e) { console.error("[contact] notify", e); }
  })());

  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/availability") {
      if (request.method !== "GET") return json({ ok: false, message: "Metodo non consentito." }, 405);
      return handleAvailability(request, env);
    }
    if (url.pathname === "/api/create-booking") {
      if (request.method !== "POST") return json({ ok: false, message: "Metodo non consentito." }, 405);
      return handleCreateBooking(request, env, ctx);
    }
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") return json({ ok: false, message: "Metodo non consentito." }, 405);
      return handleContact(request, env, ctx);
    }

    // Tutto il resto: file statici del sito (binding ASSETS).
    return env.ASSETS.fetch(request);
  }
};
