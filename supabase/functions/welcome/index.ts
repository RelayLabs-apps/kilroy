/**
 * Welcome email, sent when a new user signs up on the hosted project.
 *
 * A database trigger on auth.users (see hook.sql) POSTs { email } here after a
 * signup, carrying a shared secret. This function verifies the secret and sends
 * the welcome email through Resend. Hosted project only — self-hosters don't run
 * it.
 *
 * Deploy WITHOUT jwt verification (the trigger can't present a user JWT); the
 * shared secret is what keeps this from being an open "email anyone" relay:
 *
 *   supabase functions deploy welcome --no-verify-jwt --project-ref <ref>
 *   supabase secrets set RESEND_API_KEY=re_xxx WELCOME_SECRET=<random> \
 *     WELCOME_FROM="Kilroy <kilroy@relaylabs.site>"
 */
import { SUBJECT, HTML, TEXT } from "./email.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WELCOME_SECRET = Deno.env.get("WELCOME_SECRET");
const FROM = Deno.env.get("WELCOME_FROM") ?? "Kilroy <kilroy@relaylabs.site>";
const REPLY_TO = "kilroy@relaylabs.site";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  if (!RESEND_API_KEY || !WELCOME_SECRET) {
    console.error("welcome: missing RESEND_API_KEY or WELCOME_SECRET");
    return new Response("not configured", { status: 500 });
  }

  // Only our own signup trigger knows the secret. Without this, anyone who finds
  // the URL could make Kilroy send mail to any address.
  if (req.headers.get("authorization") !== `Bearer ${WELCOME_SECRET}`) {
    return new Response("forbidden", { status: 403 });
  }

  let email: string | null = null;
  try {
    const body = await req.json();
    // Accept a plain { email } and a database-webhook { record: { email } }.
    email = body?.email ?? body?.record?.email ?? null;
  } catch { /* handled below */ }

  if (!email || !email.includes("@")) return new Response("no email", { status: 400 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json",
      // api.resend.com is behind Cloudflare, which blocks a missing/default UA.
      "user-agent": "Kilroy-Welcome/1.0 (+https://relaylabs.site)",
    },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: SUBJECT,
      html: HTML,
      text: TEXT,
      reply_to: REPLY_TO,
      headers: { "List-Unsubscribe": `<mailto:${REPLY_TO}?subject=unsubscribe>` },
    }),
  });

  if (!res.ok) {
    // Log and still return 200: a mail failure must never look like a signup
    // failure to whatever called us, and there's nothing for it to retry.
    console.error("welcome: Resend", res.status, await res.text());
    return new Response(JSON.stringify({ ok: false, status: res.status }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
