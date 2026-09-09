# Setup

Most people set up nothing: **install Kilroy, sign in with Google, done.**

Kilroy stores your tracking in a backend run by Relay Labs, scoped to your
account and isolated from every other user by Postgres row-level security — one
user can never see another's data. If you would rather nobody else, not even
Relay Labs, hold your data, see **[Host your own data](#host-your-own-data)**
below; Kilroy is open source and runs the same on a project you control.

---

## Use it (hosted — the default)

1. **Install Kilroy** — from the Chrome Web Store, or load it unpacked:
   `chrome://extensions` → **Developer mode** → **Load unpacked** → the
   `extension/` folder.
2. **Sign in** — Kilroy icon → **Settings** → **Sign in with Google**.
3. **Try it** — reload Gmail and open a compose window. A **Tracking** chip
   appears next to Send; click it to turn tracking off for that one message.

That is the whole setup. The same Google account shows the same data on every
computer. Open the dashboard any time from the Kilroy icon → **Dashboard**.

### What an open actually means

Before you read anything into a number, read **[ACCURACY.md](ACCURACY.md)**. An
open is *an image being fetched*, which is not the same as a person reading —
scanners, Apple Mail privacy prefetch, and your own client all fetch images. The
dashboard filters what it can and is honest about the rest.

---

## Host your own data

Everything above uses the Relay Labs backend. To keep your data entirely to
yourself, point Kilroy at **your own Supabase project** instead. It all fits in
Supabase's free tier. You will need the [Supabase
CLI](https://supabase.com/docs/guides/cli) for the function deploy.

Once your project is set up (below), open Kilroy → **Settings → Advanced setup**,
enter your **Project URL** and **publishable (anon) key**, save, and sign in.
That override wins over the bundled Relay Labs project, and nothing you track
after that leaves your project.

### 1. Create the project

New project at [supabase.com](https://supabase.com/dashboard/projects), any
region near you. From **Project Settings → API**, note the **Project URL**
(`https://<ref>.supabase.co`) and the **publishable (anon) key**.

The anon key is designed to be public — row-level security is what protects your
data. **Never** put the `service_role` or `sb_secret_…` key in the extension; it
bypasses RLS entirely, and Kilroy rejects it on sight.

### 2. Run the schema

**SQL Editor → New query.** Run every file in `supabase/migrations/` **in order**,
0001 through 0004, one at a time. 0001 creates the tables, RLS policies, the
`message_stats` view, and the `record_open` / `record_click` / `note_self_view`
functions; 0002 narrows the self-view windows that otherwise erase genuine opens;
0003–0004 add the column thread-list badges are looked up by. Stop at 0001 and
Kilroy runs, but wrongly.

### 3. Deploy the endpoints

From the repo root:

```bash
supabase functions deploy px --project-ref YOUR_REF --no-verify-jwt
supabase functions deploy r  --project-ref YOUR_REF --no-verify-jwt
```

`--no-verify-jwt` is essential: these endpoints are hit by mail clients that
never carry a JWT, and if the gateway demands one, no open is ever recorded.
Check with:

```bash
curl -sS -D - -o /dev/null https://YOUR_REF.supabase.co/functions/v1/px/TESTtoken123456789.gif
```

You want `200`, `content-type: image/gif`, and `cache-control: no-store`.

### 4. Create your login and (optionally) Google sign-in

Email/password works out of the box: **Authentication → Users → Add user**, tick
*Auto Confirm User*, and sign in with that from the extension's Advanced form.

For **Sign in with Google** on your own project you need your own Google Cloud
OAuth client (client ID + secret) configured under **Authentication → Providers →
Google**, plus your extension's redirect URL under **Authentication → URL
Configuration → Redirect URLs**. The options page (Advanced) shows that exact
redirect URL. This is why email/password is the simpler self-host default.

> The options page can also **provision a blank project for you** — when Kilroy
> is not already pointed at a working backend, its setup card takes a Supabase
> access token, then runs the migrations and deploys both endpoints itself, no
> SQL editor or CLI. Since the shipped extension defaults to the Relay Labs
> backend, you will reach this card by first clearing that default (Advanced →
> point it at a different project) or by running an unpacked build with no
> `config.default.json`.

### Copying the key without corrupting it

The dashboard's key field has three ways to bite you. Use the **copy icon**, not
select-and-copy (selecting grabs a *masked* form made of middle dots). Don't pipe
the CLI through a non-UTF-8 console (it mangles those bytes). And grab the
**publishable** key, not `service_role` / `sb_secret_…`. A bad key surfaces as
`Invalid API key` or a `non ISO-8859-1 code point` error; Kilroy checks for all
of these on save. On Windows, `tools/copy-key.ps1` copies it cleanly.

---

## Verify it works

Send yourself a message from another account and open it — within a few seconds
the sent copy in your thread shows `✓✓ opened just now`. Opening your *own* sent
message should **not** count: the extension tells the backend you're looking and
files the hit as `self`. Note that Kilroy only instruments the Gmail account you
signed in as; in any other account open in the same browser, no chip appears.

The dashboard (Kilroy icon → **Dashboard**) shows opens per day, opens by
recipient, and a table of every tracked message. Click any row to expand the raw
classification history — every fetch and which rule counted or discounted it.

---

## Optional and caveats

**Sweep abandoned drafts.** Every compose you open and discard leaves a `draft`
row — invisible and tiny. To clear them automatically, enable `pg_cron` and
schedule `select public.purge_stale_drafts();` daily. (Self-host only; the
hosted backend is swept for you.)

**A nicer pixel URL.** `https://<ref>.supabase.co/functions/v1/px/<token>.gif`
works but is long and names the backend. Supabase custom domains are a paid
add-on; the free route is a Cloudflare Worker on a domain you own that proxies to
the Edge Function (pass `X-Forwarded-For` through so classification keeps
working). Self-host only.

**Free-tier pause.** Supabase pauses free projects after **7 days with no
activity**, silently stopping pixel recording. Ordinary use keeps a project
awake; a long holiday might not. Self-host only — the Relay Labs backend stays
active.

---

## Troubleshooting

**No chip in the compose window.** Reload Gmail after installing. Confirm you're
signed in (Settings), and that you're in the Google account you signed into
Kilroy with — Kilroy stays out of other accounts by design.

**"Signed out" / "Not signed in".** Settings → sign in. The session refreshes
itself, but a Google password change or sign-out invalidates it.

**Google sign-in returns "came back without a session".** The extension's
redirect URL isn't in the project's allow list. Compare the URL on the options
page (Advanced → redirect step) against **Authentication → URL Configuration →
Redirect URLs** — they must match exactly, trailing slash included. On the hosted
backend this is managed for you; on a store install every user shares one
redirect URL.

**Opens never appear (self-host).** Confirm the functions deployed with
`--no-verify-jwt` and curl the pixel endpoint as in step 3.

**Everything shows as `self` or `prefetch`.** Usually working as designed — see
[ACCURACY.md](ACCURACY.md) for what the classifications mean and how to retune
the windows.

---

## Building from source / forking

The extension ID is pinned by the `key` field in `manifest.json`, so unpacked
builds keep a stable ID (and therefore a stable OAuth redirect URL) across
machines. The private half, `tools/kilroy-extension.pem`, is gitignored and only
needed to pack a `.crx`. If you fork, generate your own:

```bash
openssl genrsa 2048 > tools/kilroy-extension.pem
```

then put the base64 of `openssl rsa -in tools/kilroy-extension.pem -pubout
-outform DER` into `manifest.json` as `key`, point `config.default.json` at your
own backend, and whitelist your own redirect URL. `python tools/package.py`
builds a clean store zip (it strips the `key` and any local override, and refuses
to ship a secret key).
