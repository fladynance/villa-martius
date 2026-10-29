// Verifica anti-bot con Cloudflare Turnstile.
// Se TURNSTILE_SECRET non è configurato, la verifica è disattivata (ritorna true).
export async function verifyTurnstile(token, ip) {
  const secret = Netlify.env.get("TURNSTILE_SECRET");
  if (!secret) return true;
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip || "" })
    });
    const j = await r.json();
    return !!j.success;
  } catch (e) {
    console.error("[turnstile]", e);
    return false;
  }
}
