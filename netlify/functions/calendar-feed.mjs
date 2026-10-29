import { getDatabase } from "@netlify/database";

const db = getDatabase();

// Feed iCal (.ics) delle prenotazioni, da sottoscrivere in Google Calendar.
// Protetto da un token segreto: /.netlify/functions/calendar-feed?token=XXXX
// Richiede la variabile d'ambiente CALENDAR_FEED_TOKEN.

function esc(t) {
  return String(t == null ? "" : t)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function dateOnly(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
function dt(v) { return dateOnly(v).replace(/-/g, ""); }
function stamp() { return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

export default async (req) => {
  const expected = Netlify.env.get("CALENDAR_FEED_TOKEN");
  const given = new URL(req.url).searchParams.get("token");
  if (!expected || given !== expected) return new Response("Forbidden", { status: 403 });

  let rows;
  try {
    rows = await db.sql`
      SELECT b.reference, b.check_in, b.check_out, b.guests,
             b.main_nome, b.main_cognome, b.main_email, b.main_telefono,
             b.main_paese, b.main_citta, b.arrivo_ora, b.note, u.label
      FROM bookings b
      JOIN units u ON u.id = b.unit_id
      WHERE b.status IN ('confermata', 'in_attesa')
      ORDER BY b.check_in`;
  } catch (e) {
    console.error("[calendar-feed]", e);
    return new Response("Internal error", { status: 500 });
  }

  const now = stamp();
  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Villa Martius//Prenotazioni//IT\r\n";
  ics += "CALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Prenotazioni Villa Martius\r\n";
  for (const r of rows) {
    const summary = `${r.label} — ${r.main_nome} ${r.main_cognome}`;
    const desc = [
      `Codice: ${r.reference}`,
      `Ospiti: ${r.guests}`,
      `Contatto: ${r.main_nome} ${r.main_cognome}`,
      `Email: ${r.main_email}`,
      `Telefono: ${r.main_telefono}`,
      `Residenza: ${[r.main_citta, r.main_paese].filter(Boolean).join(", ")}`,
      r.arrivo_ora ? `Arrivo stimato: ${r.arrivo_ora}` : null,
      r.note ? `Note: ${r.note}` : null,
      "Pagamento: in struttura"
    ].filter(Boolean).join("\n");
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${r.reference}@villamartius.it\r\n`;
    ics += `DTSTAMP:${now}\r\n`;
    ics += `DTSTART;VALUE=DATE:${dt(r.check_in)}\r\n`;
    ics += `DTEND;VALUE=DATE:${dt(r.check_out)}\r\n`;
    ics += `SUMMARY:${esc(summary)}\r\n`;
    ics += `DESCRIPTION:${esc(desc)}\r\n`;
    ics += "END:VEVENT\r\n";
  }
  ics += "END:VCALENDAR\r\n";

  return new Response(ics, {
    status: 200,
    headers: { "content-type": "text/calendar; charset=utf-8" }
  });
};

export const config = { method: ["GET"] };
