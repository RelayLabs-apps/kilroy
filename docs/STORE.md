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
Free email tracker for Gmail. See opens & read receipts, filter out bots, and own your data. Open source, no signature.
```

**Category:** Communication
**Language:** English

**Detailed description**

```
Kilroy is a free email tracker for Gmail. See when the emails you send are
opened, get read receipts right inside your inbox, and — unlike every other
tracker — keep your data yours.

WHAT YOU GET
• Email open tracking — a ✓✓ and an open count appear on your sent message,
  inside Gmail
• Read receipts for Gmail, with the time of the first open
• Link click tracking (optional) — a stronger signal than an open
• A dashboard: opens per day, opens by recipient, and every message you track
• Honest filtering — security scanners, Apple Mail privacy prefetch, and your own
  re-reads are detected and set aside, so a "read" means a read
• No signature and no "Sent with…" branding on your emails — the tracker is an
  invisible 1×1 pixel

OWN YOUR DATA
Most email trackers route every message through their own servers, and your
recipient list becomes their asset. Kilroy is open source, and your tracking is
scoped to your account and isolated from every other user. Want to hold it
entirely yourself? One click points Kilroy at your own database, so nobody — not
even us — can read it. Read every line: github.com/RelayLabs-apps/kilroy

WHO IT'S FOR
Sales and SDRs, recruiters, founders, freelancers, and job seekers — anyone who
wants to know their email landed, without a monthly fee or handing their contacts
to a third party.

HONEST BY DESIGN
An "open" is an image being fetched, which is not always a person reading. Kilroy
tells you what each number can and can't support instead of inventing a city and
a device. No geolocation theatre, no fake precision.

Open tracking sits in a genuine grey area, and tracking recipients in some
jurisdictions may require their consent — Kilroy makes it easy to turn off per
message, from the chip beside Send.

Free. No credit card. Sign in with Google and you're tracking.
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
