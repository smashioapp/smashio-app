// website-plan.md W4 — email capture (closes gtm-plan G15). Client never gets the anon key or a
// direct insert path (§5.5 T3, and the "no direct anon insert" rule in
// 20260910020000_web_signups.sql) — this function is the only thing that calls web_signup().
// Turnstile and double opt-in (DEC7) are deferred pending a third-party account; the honeypot
// field below is the only bot defence shipped so far.
const { callRpc } = require("./_venue-lib");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const suburb = typeof body.suburb === "string" ? body.suburb.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim() : "footer";
  // Hidden field real visitors never fill; named to look like a normal field to a scraping bot.
  const honeypot = typeof body.website === "string" ? body.website : "";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "invalid_email" });
  }

  try {
    await callRpc("web_signup", {
      p_email: email,
      p_suburb: suburb || null,
      p_source: source || "footer",
      p_honeypot: honeypot,
    });
  } catch {
    return res.status(500).json({ ok: false, error: "signup_failed" });
  }

  return res.status(200).json({ ok: true });
};
