# Chrome Web Store submission kit

Everything needed to publish Kilroy as an **unlisted** listing (installable by
link, not publicly discoverable). Paste each field from here; the zip to upload
is produced by `python tools/package.py` → `dist/kilroy-<version>.zip`.

Set **Visibility → Unlisted** in the Web Store dashboard. Unlisted still goes
through the same review as public; it only removes discoverability.

---

## Store listing

**Name**

```
Kilroy
```

**Summary** (≤132 characters)

```
See when your Gmail messages are opened. Install, sign in with Google, done — or host your own data.
```

**Category:** Workflow & Planning
**Language:** English

**Detailed description**

```
Kilroy tells you when the email you send in Gmail gets opened. Install, sign in
with Google, and you're tracking — nothing to set up.

What it does
• Adds an invisible 1×1 pixel to messages you compose, and records the fetch
  when the message is opened
• Shows ✓✓ with an open count on the message inside Gmail
• Optionally rewrites links so you can see clicks — a stronger signal than opens
• Filters out the things that fetch images but aren't people: security scanners,
  Apple Mail privacy prefetch, and your own client reading your Sent mail
• Gives you a dashboard over everything

What it does NOT do
No geolocation. No device fingerprinting. No "opened in Boston on an iPhone."
Gmail fetches every image through its own proxy, so the address and user agent
that arrive belong to Google, not your recipient — Kilroy does not pretend
otherwise.

Own your data
By default, tracking data is stored in a database run by Relay Labs and scoped to
your account, so no other user can see it. Prefer to hold it yourself? Kilroy is
open source, and one click in the options points it at your own Supabase project
instead — then nobody, including Relay Labs, can access your data.

Open source: https://github.com/RelayLabs-apps/kilroy

A note on tracking: open tracking sits in a genuine grey area, and tracking
recipients in some jurisdictions may require their consent. Kilroy makes it easy
to turn off per message, from the chip beside Send. Use it on your own
correspondence, at your own discretion.
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

Answer the dashboard's data form as follows. The key fact for the **default
(hosted)** mode: data is stored by Relay Labs on the user's behalf, scoped to
their account, and never sold or shared. (In self-host mode the extension sends
data only to the user's own project; disclose the hosted default, since that is
what most installs use.)

Data collected (mark "collected" and, for hosted mode, note it leaves the
device):
- **Personally identifiable information** — recipient email addresses and message
  subjects of messages the user chooses to track. Stored in the Relay Labs
  Supabase database (hosted) or the user's own (self-host).
- **Authentication information** — the user's sign-in session, stored locally on
  the device.
- **Website content** — the extension reads the Gmail page to place its controls
  and pixel; it does not collect or transmit email contents.

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

Required: at least one at **1280×800** or **640×400** (PNG or JPEG). Recommended
three to four. The ones that sell it are the in-Gmail shots — capture those from
your live install:

1. **Compose window** with the "Tracking" chip beside Send.
2. **A sent thread** showing the ✓✓ badge and open count.
3. **The dashboard** — opens per day and the message table.
4. **One-click setup** — the options page "Set up in one click" card.
   (A rendered copy of this one is generated at
   `dist/store/options-1280x800.png` by the screenshot step; the others need
   real Gmail data and are yours to capture.)

Optional promo tile: 440×280.

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
