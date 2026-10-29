import { getDatabase } from "@netlify/database";
import { validateBooking } from "./lib/validate.mjs";
import { verifyTurnstile } from "./lib/turnstile.mjs";
import { sendBookingEmails } from "./lib/email.mjs";
import { createCalendarEvent } from "./lib/calendar.mjs";
import { json } from "./lib/respond.mjs";

const db = getDatabase();

function genRef() {
  const a = Date.now().toString(36).toUpperCase().slice(-5);
  const b = Math.random().toString(36).toUpperCase().slice(2, 5);
  return "VM-" + a + b;
}

function isConflict(e) {
  const code = e?.code || e?.cause?.code;
  return code === "23P01" || code === "23505" || /exclusion|overlap|duplicate key|23P01|23505/i.test(e?.message || "");
}

// POST /.netlify/functions/create-booking
export default async (req, context) => {
  if (req.method !== "POST") return json({ ok: false, message: "Metodo non consentito." }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, message: "Richiesta non valida." }, 400); }

  // Anti-bot (attivo solo se TURNSTILE_SECRET è configurato).
  const human = await verifyTurnstile(body.turnstile, context?.ip);
  if (!human) return json({ ok: false, message: "Verifica anti-spam non superata. Ricarica la pagina e riprova." }, 400);

  const v = validateBooking(body);
  if (!v.ok) return json({ ok: false, message: v.message }, 400);
  const d = v.data;

  // Inserimento atomico: il DB assegna un'unità libera della tipologia e il vincolo
  // di esclusione impedisce qualsiasi sovrapposizione (anti-overbooking garantito).
  let inserted = null;
  for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
    const reference = genRef();
    try {
      const rows = await db.sql`
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
      return json({ ok: false, message: "Errore durante la prenotazione. Riprova tra poco." }, 500);
    }
  }
  if (!inserted) {
    return json({ ok: false, reason: "unavailable", message: "Spiacenti, per le date scelte questa sistemazione non è più disponibile." }, 409);
  }

  // Notifiche: non devono far fallire la prenotazione già salvata.
  try { await sendBookingEmails(d, inserted.reference); } catch (e) { console.error("[create-booking] email", e); }
  try { await createCalendarEvent(d, inserted.reference); } catch (e) { console.error("[create-booking] calendar", e); }

  return json({ ok: true, reference: inserted.reference });
};

export const config = {
  method: ["POST"],
  rateLimit: { windowSize: 60, windowLimit: 12, aggregateBy: ["ip"] }
};
