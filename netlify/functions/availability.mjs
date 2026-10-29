import { getDatabase } from "@netlify/database";
import { UNITS } from "./lib/units.mjs";
import { json } from "./lib/respond.mjs";

const db = getDatabase();

// GET /.netlify/functions/availability?unita=...&arrivo=YYYY-MM-DD&partenza=YYYY-MM-DD
export default async (req) => {
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

    const rows = await db.sql`
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
};

export const config = { method: ["GET"] };
