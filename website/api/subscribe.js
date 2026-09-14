// website-plan.md W4 — email capture (closes gtm-plan G15). Client never gets the anon key or a
// direct insert path (§5.5 T3, and the "no direct anon insert" rule in
// 20260910020000_web_signups.sql) — this function is the only thing that calls web_signup().
// Turnstile and double opt-in (DEC7) are deferred pending a third-party account; the honeypot
// field below is the only bot defence shipped so far.
//
// Notify email (2026-09-11): fires after a successful signup so a human sees it and can add
// Android testers to the Play Console allowlist manually — nothing else reads web_signups yet.
// Confirmation email (2026-09-12): the form copy promises "we'll add you and email you back" —
// this is that email, sent to the signer themselves, not just the internal notify.
// Both are best-effort: a Resend failure never fails the request, the signup is already recorded.
const { callServiceRpc } = require("./_venue-lib");

const NOTIFY_TO = "hello@smashio.com.au";
const NOTIFY_FROM = "Smashio Website <notify@smashio.com.au>";
const CONFIRM_FROM = "Smashio <hello@smashio.com.au>";
const TESTFLIGHT_URL = "https://testflight.apple.com/join/cJMZQmbn";

// Best-effort: never throws, never fails the request. But it does log, loudly — Resend answers a
// bad key, an unverified domain or a rejected recipient with a 4xx and a JSON body, not an
// exception, so a version of this that only caught throws reported success for every one of them.
async function sendResendEmail(label, payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(`resend:${label} skipped — RESEND_API_KEY not set in this environment`);
    return;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`resend:${label} failed ${resp.status} ${text.slice(0, 500)}`);
      return;
    }
    console.log(`resend:${label} sent ${text.slice(0, 200)}`);
  } catch (err) {
    console.error(`resend:${label} threw ${err && err.message}`);
  }
}

function notifySignup({ email, suburb, source }) {
  return sendResendEmail("notify", {
    from: NOTIFY_FROM,
    to: [NOTIFY_TO],
    subject: `New signup (${source}): ${email}`,
    text: [
      `Email: ${email}`,
      `Suburb: ${suburb || "-"}`,
      `Source: ${source}`,
      `When: ${new Date().toISOString()}`,
      source.includes("android")
        ? "\nAndroid beta request — add their Google account to the Play Console internal testing allowlist and reply to confirm."
        : "",
    ].join("\n"),
  });
}

function confirmSignup({ email, source }) {
  const isAndroid = source.includes("android");
  return sendResendEmail("confirm", {
    from: CONFIRM_FROM,
    to: [email],
    subject: isAndroid ? "You're on the Smashio Android list" : "Thanks for your interest in Smashio",
    text: isAndroid
      ? [
          "Nice one, you're on the list.",
          "",
          "Android's invite-only while we sort the public listing. We'll add the Google account tied to this email to the Play internal testing allowlist and follow up here once it's through, usually within a day.",
          "",
          "One thing we need from you: reply to this email with the Google account (Gmail address) you want added, if it's different from this one.",
          "",
          "Cheers,",
          "The Smashio team",
        ].join("\n")
      : [
          "Thanks for putting your hand up, we'll keep you posted.",
          "",
          `iPhone's live now on TestFlight if you're keen to jump on: ${TESTFLIGHT_URL}`,
          "",
          "Cheers,",
          "The Smashio team",
        ].join("\n"),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const suburb = typeof body.suburb === "string" ? body.suburb.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim() || "footer" : "footer";
  // Hidden field real visitors never fill; named to look like a normal field to a scraping bot.
  const honeypot = typeof body.website === "string" ? body.website : "";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "invalid_email" });
  }

  // Vercel sets x-forwarded-for to "client, proxy1, proxy2..." — the first hop is the visitor.
  const forwardedFor = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : "";
  const ip = forwardedFor.split(",")[0].trim() || req.socket?.remoteAddress || null;

  try {
    await callServiceRpc("web_signup", {
      p_email: email,
      p_suburb: suburb || null,
      p_source: source,
      p_honeypot: honeypot,
      p_ip: ip,
    });
  } catch (err) {
    const message = err && err.message ? err.message : "";
    if (message.includes("Too many signups")) {
      return res.status(429).json({ ok: false, error: "rate_limited" });
    }
    console.error(`subscribe: web_signup failed — ${message}`);
    return res.status(500).json({ ok: false, error: "signup_failed" });
  }

  if (!honeypot) {
    await Promise.all([notifySignup({ email, suburb, source }), confirmSignup({ email, source })]);
  }

  return res.status(200).json({ ok: true });
};
