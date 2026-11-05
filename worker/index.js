// Worker Villa Martius: serve il sito statico (binding ASSETS) e il motore di
// prenotazione su /api/*. Stessa logica delle vecchie Netlify Functions, stesso
// database Postgres (Neon) e stesso anti-overbooking tramite vincolo di esclusione.
import { neon } from "@neondatabase/serverless";
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

function isConflict(e) {
  const code = e?.code || e?.cause?.code;
  return code === "23P01" || code === "23505" ||
    /exclusion|overlap|duplicate key|23P01|23505/i.test(e?.message || "");
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

    const sql = neon(env.DATABASE_URL);
    const rows = await sql`
      SELECT count(*)::int AS n
      FROM units
      WHERE room_type = ${unita}
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.unit_id = units.id
            AND b.status IN ('confermata', 'in_attesa')
            AND daterange(b.check_in, b.check_out, '[)') && daterange(${arrivo}::date, ${partenza}::date, '[)')
        )`;
    const n = rows[0]?.n ?? 0;
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
  // Anti-bot Turnstile: verifica solo se è stato prodotto un token. Così, se il
  // widget non è disponibile, un cliente vero non resta bloccato (resta attivo
  // l'honeypot). Un token presente ma non valido viene comunque rifiutato.
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (body.turnstile) {
    const human = await verifyTurnstile(body.turnstile, ip, env);
    if (!human) return json({ ok: false, message: "Verifica anti-spam non superata. Ricarica la pagina e riprova." }, 400);
  }

  const v = validateBooking(body);
  if (!v.ok) return json({ ok: false, message: v.message }, 400);
  const d = v.data;

  if (!env.DATABASE_URL) {
    return json({ ok: false, message: "DEBUG: DATABASE_URL non impostata nel Worker." }, 500);
  }
  let sql;
  try {
    sql = neon(env.DATABASE_URL);
  } catch (e) {
    return json({ ok: false, message: "DEBUG connessione: " + String((e && e.message) || e) }, 500);
  }

  // Inserimento atomico: il DB assegna un'unità libera della tipologia e il vincolo
  // di esclusione impedisce qualsiasi sovrapposizione (anti-overbooking garantito).
  let inserted = null;
  for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
    const reference = genRef();
    try {
      const rows = await sql`
        INSERT INTO bookings (
          reference, unit_id, room_type, check_in, check_out, guests,
          main_nome, main_cognome, main_email, main_telefono, main_paese, main_citta,
          extra_ospiti, arrivo_ora, note
        )
        SELECT
          ${reference}, u.id, ${d.unita}, ${d.arrivo}::date, ${d.partenza}::date, ${d.ospiti},
          ${d.mp.nome}, ${d.mp.cognome}, ${d.mp.email}, ${d.mp.telefono}, ${d.mp.paese}, ${d.mp.citta || null},
          ${JSON.stringify(d.extra)}::jsonb, ${d.arrivo_ora || null}, ${d.note || null}
        FROM units u
        WHERE u.room_type = ${d.unita}
          AND NOT EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.unit_id = u.id
              AND b.status IN ('confermata', 'in_attesa')
              AND daterange(b.check_in, b.check_out, '[)') && daterange(${d.arrivo}::date, ${d.partenza}::date, '[)')
          )
        ORDER BY u.id
        LIMIT 1
        RETURNING id, reference`;

      if (rows.length === 0) {
        return json({ ok: false, reason: "unavailable", message: "Spiacenti, per le date scelte questa sistemazione non è più disponibile." }, 409);
      }
      inserted = { id: rows[0].id, reference: rows[0].reference };
    } catch (e) {
      if (isConflict(e)) continue; // gara concorrente o collisione codice → riprova
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

    // Tutto il resto: file statici del sito (binding ASSETS).
    return env.ASSETS.fetch(request);
  }
};
