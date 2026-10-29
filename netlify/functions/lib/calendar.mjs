// Specchio di ogni prenotazione su un singolo Google Calendar.
// Autenticazione tramite account di servizio (JWT firmato con Web Crypto, nessuna dipendenza).
// Richiede: GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY, GOOGLE_CALENDAR_ID.
// Se non configurato, l'operazione viene saltata senza errori.

function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(pem) {
  const clean = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8", der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
}

async function getAccessToken(clientEmail, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc(header) + "." + enc(claim);
  const key = await importKey(privateKeyPem);
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + "." + b64url(new Uint8Array(sig));

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google token: " + JSON.stringify(j));
  return j.access_token;
}

function description(d, reference) {
  const lines = [
    `Codice: ${reference}`,
    `Ospiti: ${d.ospiti}`,
    `Ospite principale: ${d.mp.nome} ${d.mp.cognome}`,
    `Email: ${d.mp.email}`,
    `Telefono: ${d.mp.telefono}`,
    `Residenza: ${[d.mp.citta, d.mp.paese].filter(Boolean).join(", ")}`,
    d.arrivo_ora ? `Arrivo stimato: ${d.arrivo_ora}` : null,
    d.extra && d.extra.length ? `Altri ospiti: ${d.extra.map((g) => `${g.nome} ${g.cognome}`.trim()).join("; ")}` : null,
    d.note ? `Note: ${d.note}` : null,
    "Pagamento: in struttura"
  ].filter(Boolean);
  return lines.join("\n");
}

export async function createCalendarEvent(d, reference) {
  const clientEmail = Netlify.env.get("GOOGLE_SA_CLIENT_EMAIL");
  const privateKey = Netlify.env.get("GOOGLE_SA_PRIVATE_KEY");
  const calendarId = Netlify.env.get("GOOGLE_CALENDAR_ID");
  if (!clientEmail || !privateKey || !calendarId) {
    console.warn("[calendar] credenziali mancanti — evento non creato");
    return;
  }
  const token = await getAccessToken(clientEmail, privateKey);
  const event = {
    summary: `${d.unitName} — ${d.mp.nome} ${d.mp.cognome}`,
    description: description(d, reference),
    // Eventi "all-day": end.date è esclusivo, quindi la partenza coincide col checkout.
    start: { date: d.arrivo },
    end: { date: d.partenza }
  };
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event)
    }
  );
  if (!r.ok) throw new Error("Calendar " + r.status + ": " + (await r.text()));
}
