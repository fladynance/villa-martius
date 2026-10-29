import { UNITS } from "./units.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function s(v, max = 200) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function isISODate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
}

// Valida e normalizza il payload di prenotazione. Ritorna {ok, data} oppure {ok:false, message}.
export function validateBooking(b) {
  if (!b || typeof b !== "object") return { ok: false, message: "Dati mancanti." };

  const unita = s(b.unita, 60);
  const unit = UNITS[unita];
  if (!unit) return { ok: false, message: "Sistemazione non valida." };

  const arrivo = s(b.arrivo, 10);
  const partenza = s(b.partenza, 10);
  if (!isISODate(arrivo) || !isISODate(partenza)) return { ok: false, message: "Date non valide." };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const da = new Date(arrivo + "T00:00:00");
  const dp = new Date(partenza + "T00:00:00");
  if (da < today) return { ok: false, message: "La data di arrivo non può essere nel passato." };
  if (dp <= da) return { ok: false, message: "La partenza deve essere successiva all'arrivo." };
  const nights = Math.round((dp - da) / 86400000);
  if (nights > 60) return { ok: false, message: "Il soggiorno non può superare 60 notti." };

  let ospiti = parseInt(b.ospiti_num, 10);
  if (!(ospiti >= 1)) ospiti = 1;
  if (ospiti > unit.capienza) return { ok: false, message: "Numero di ospiti superiore alla capienza." };

  const mpIn = b.ospite_principale || {};
  const mp = {
    nome: s(mpIn.nome, 80),
    cognome: s(mpIn.cognome, 80),
    email: s(mpIn.email, 120),
    telefono: s(mpIn.telefono, 40),
    paese: s(mpIn.paese, 80),
    citta: s(mpIn.citta, 80)
  };
  if (!mp.nome || !mp.cognome || !mp.telefono || !mp.paese) {
    return { ok: false, message: "Compila tutti i dati obbligatori dell'ospite principale." };
  }
  if (!EMAIL_RE.test(mp.email)) return { ok: false, message: "Email non valida." };

  let extra = Array.isArray(b.ospiti_extra) ? b.ospiti_extra : [];
  extra = extra
    .slice(0, Math.max(0, unit.capienza - 1))
    .map((g) => ({ nome: s(g && g.nome, 80), cognome: s(g && g.cognome, 80) }))
    .filter((g) => g.nome || g.cognome);

  const arrivo_ora = s(b.arrivo_ora, 10);
  const note = s(b.note, 1000);

  return {
    ok: true,
    data: { unita, unitName: unit.nome, arrivo, partenza, nights, ospiti, mp, extra, arrivo_ora, note }
  };
}
