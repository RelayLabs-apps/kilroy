# Chrome Web Store submission kit

Everything needed to publish Kilroy on the Chrome Web Store. Paste each field
from here; the zip to upload is produced by `python tools/package.py` →
`dist/kilroy-<version>.zip`. Visibility: **Public**.

The **Name** and **Description** below are written for search: Chrome Web Store
ranks heavily on the item name, and "Kilroy" alone matches nothing people type.
The name front-loads the terms searchers actually use (email tracker, Gmail, read
receipts) and keeps the brand after a pipe. **The name lives in `manifest.json`,
so changing it needs a package re-upload; the Description is a Store-Listing field
you can edit in the dashboard without re-uploading.**

---

## Store listing

**Name** (manifest `name`; keep the first ~45 chars keyword-dense — that's what
shows before truncation)

```
Free Email Tracker for Gmail — Read Receipts & Open Tracking | Kilroy
```

**Summary** (≤132 characters)

```
See when your Gmail is opened — honest read receipts, and your data stays yours. Free and open source.
```

**Category:** Communication
**Language:** English

**Detailed description** — rewritten after a keyword-spam rejection. The rule
Google enforces: no section may pile up more than five keyword-like entities,
and the same terms can't be repeated for ranking. So this reads as plain prose
that mentions each term once, with no audience list and no keyword stack. Keep it
that way.

```
Kilroy is an email tracker for Gmail, built to be honest.

It shows you when the messages you send have been opened: a quiet double-check
and a count appear on the sent message itself, and a dashboard rolls up opens
over time and by recipient. Link clicks can be tracked too, if you want the
stronger signal.

Where most trackers overstate what they know, Kilroy is careful. An open is an
image being fetched, not proof a person read your message — so it sets aside
security scanners, Apple Mail's privacy prefetch, and your own re-reads, and it
never guesses a location from a proxy. The first-open time is the figure you can
actually rely on.

Your data stays yours. Tracking is kept in an account only you can read, and one
click lets you point Kilroy at your own database instead. Because it's open
source, every claim here can be checked against the code.

A few things worth knowing:
• Tracking is a switch beside Send — turn it off for any single message.
• Nothing is added to your email: no signature, no branding.
• No credit card and no separate password — sign in with Google and you're set.

Open source: github.com/RelayLabs-apps/kilroy
Learn more: kilroy.relaylabs.site
```

**Single purpose** (required)

```
Kilroy tells the user when the Gmail messages they send are opened, by embedding
a tracking pixel and recording the fetch in a Supabase backend that the user
owns and controls. Everything the extension does serves that one purpose.
```

**Privacy policy URL**

```
https://github.com/RelayLabs-apps/kilroy/blob/main/docs/PRIVACY.md
```

**Homepage / support URL**

```
https://github.com/RelayLabs-apps/kilroy
```

---

## Permission justifications

Paste one per permission when the dashboard asks "why do you need this?".

**storage**
```
Stores the user's own Supabase project URL, publishable key, preferences, and
login session locally so they persist between browser sessions. Nothing here is
transmitted to the developer or any third party.
```

**identity**
```
Used only for the optional "Sign in with Google" flow, via
chrome.identity.launchWebAuthFlow, against the user's own Supabase project.
Kilroy never sees the user's Google password and requests no Gmail API scopes.
Email-and-password sign-in is the default and does not use this permission.
```

**Host permissions** — the store uses a single justification box (1000-char
limit) for all host permissions. Paste this (983 chars):
```
mail.google.com: a content script places the tracking on/off toggle beside Gmail's Send button, draws open-count badges on the user's own sent messages, and inserts the 1x1 tracking pixel into messages the user composes. It never reads, stores, or transmits the contents of any email. *.supabase.co: the extension talks only to the user's own Supabase project (its REST API, Auth, and pixel/redirect Edge Functions); the wildcard is required because each user's project lives at a different subdomain, and only the one the user configured is ever contacted. api.supabase.com: one-click setup uses the Supabase Management API to create the database schema and deploy the two tracking endpoints inside the user's own project, using an access token the user pastes that is discarded when setup finishes. ipwho.is: optional IP geolocation, only when the user clicks a lookup button on a specific address, never automatically; results are cached locally so an address is never sent twice.
```

---

## Data collection disclosures

Fill the **Privacy practices** form for the **default (hosted)** mode — that is
what most installs use. In hosted mode the data below **leaves the device** and
is stored by Relay Labs, scoped to the user's account, never sold or shared.
(Self-host mode sends the same data only to the user's own project.)

Mark these categories as **collected** (and, since hosted mode transmits them to
a remote server, not kept only on the device):
- **Personally identifiable information** — recipient email addresses of tracked
  messages, and the user's own email from sign-in.
- **Personal communications** — the subject lines of messages the user tracks.
- **Authentication information** — the sign-in session, held on the device and
  sent to the backend to authenticate requests.

Do **not** mark these — Kilroy does not collect them: **Website content** (it
reads the Gmail page to place its controls and pixel, but does not collect or
transmit email bodies), location, financial info, health info, web history, or
user activity.

Certifications (all true for Kilroy):
- ☑ I do not sell or transfer user data to third parties (outside approved use cases)
- ☑ I do not use or transfer user data for purposes unrelated to the item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending
- ☑ This item complies with the Limited Use requirements

Note for review: Kilroy uses a content script on mail.google.com; it does **not**
use the Gmail API or any Google OAuth restricted scope, so Google API
restricted-scope verification does not apply. The `identity` permission is for
Google sign-in to the Kilroy backend (a Supabase project), not for Gmail. Data
handling is set out in the privacy policy:
https://github.com/RelayLabs-apps/kilroy/blob/main/docs/PRIVACY.md

---

## Screenshots

Required: at least one at **1280×800** or **640×400** (PNG or JPEG). All five are
ready in `dist/store/`, ordered strongest first:

1. `dashboard-1280x800.png` — the dashboard (real UI, demo data)
2. `badge-1280x800.png` — the ✓✓ "K" badge on a sent message
3. `compose-1280x800.png` — the Tracking chip beside Send (a real capture)
4. `popup-1280x800.png` — the tracked-message list
5. `options-1280x800.png` — the setup / sign-in screen

Promo tiles, also in `dist/store/`: `marquee-1400x560.png` (marquee) and
`promo-440x280.png` (small). All are synthetic/placeholder data — no real
recipient information.

---

## Before you submit

- [ ] Bump `version` in `manifest.json` if re-uploading over a previous version
- [ ] `python tools/package.py` → upload `dist/kilroy-<version>.zip`
- [ ] Confirm the uploaded manifest has **no** `key` field (package.py strips it)
- [ ] Paste every field above; set Visibility → Unlisted
- [ ] After the first upload, read the store-assigned **Item ID** — that is the
      permanent extension ID all users share. Nothing in setup needs it by hand
      anymore (provisioning writes each user's redirect URL automatically), but
      it is what a store install is keyed to.
