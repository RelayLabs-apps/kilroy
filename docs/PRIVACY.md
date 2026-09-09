# Privacy policy

**Kilroy Chrome extension**, published by **Relay Labs**. Last updated 9 September 2026.

## Two modes — and which one decides who holds your data

Kilroy can run two ways, and the mode you choose decides who stores your data.

**Hosted (the default).** When you install Kilroy and sign in, it uses a Supabase
database **operated by Relay Labs**. Your tracked-message data lives there. Relay
Labs is the data controller for that database and can technically access it. Every
user's rows are isolated from every other user's by Postgres row-level security
scoped to your account — one user can never read another's data through the app.

**Self-hosted (advanced).** You can instead point Kilroy at **your own Supabase
project** (Options → Advanced → use your own Supabase). Then your data lives only
in your project, **Relay Labs has no access to it**, and nothing below about
"Relay Labs stores…" applies to you. This is the original Kilroy model, and it
remains fully supported.

The rest of this policy describes the **hosted default**. If you self-host, you
are the controller of your own data and this reduces to "the software, on your
own infrastructure."

## What is stored, in hosted mode

Written to the Relay Labs Supabase database, scoped to your account:

| Data | Why |
| --- | --- |
| Subjects and recipient addresses of messages you choose to track | So the dashboard can tell one tracked message from another |
| A random token per message | Identifies the tracking pixel; unguessable by design |
| Gmail thread and message ids | To show the open count against the right message in Gmail |
| Open events: timestamp, IP address of the fetching client, user agent, classification | The open record, and the basis for filtering out machine fetches |
| Link clicks, if you enable link tracking | The stronger signal that someone acted on the message |

Stored **locally on your machine** (`chrome.storage`), never sent to Relay Labs:
your sign-in session and your preferences.

Kilroy reads the Gmail page you have open in order to place its controls and
badges and to attach the pixel to messages you compose. It does **not** read,
copy, or transmit the body of your mail.

## Signing in

Hosted Kilroy signs you in with **Google** (or an email and password) through
Supabase's authentication. Kilroy never sees your Google password and requests
**no Gmail API scopes** — the Google sign-in only establishes who you are, so
your data can be scoped to you.

## About the people you email

If you track a message, Kilroy records the recipient addresses you sent it to and
the fetches that message's pixel receives — and, in hosted mode, that record is
stored by Relay Labs on your behalf. Those fetches are how open tracking works,
and the recipient is not asked.

That makes **you** responsible for the decision to track them. Under GDPR and
ePrivacy rules, tracking pixels aimed at recipients in the EU and UK may require
their consent, and some jurisdictions take a stricter view than others. Kilroy
provides a per-message off switch beside the Send button for exactly this reason.
Whether and when to use it is your call and your responsibility.

Note also what an open event does *not* contain. For a Gmail recipient the IP
address belongs to Google's image proxy, not to the reader. See
[ACCURACY.md](ACCURACY.md).

## Third-party services

- **Supabase** — stores the data above. In hosted mode this is the Relay Labs
  project; in self-host mode it is your own. Governed by Supabase's terms.
- **Google Sign-In**, through Supabase's OAuth flow, to identify you. No Gmail
  access; Kilroy never sees your password.
- **ipwho.is**, only for IP geolocation, and only when you press the lookup
  button on a specific address. Never automatic. Results are cached locally so
  the same address is not sent twice.

## Keeping and deleting your data

- **Local:** signing out of the extension clears the stored session from your
  machine; removing the extension clears the rest.
- **Hosted:** to have your stored rows deleted from the Relay Labs database,
  email **app.relaylabs@gmail.com** from the address you signed in with, and we
  will delete your account's data. You can also switch to self-hosting at any
  time, after which nothing new is written to the Relay Labs database.
- **Self-hosted:** it is your database — delete rows, drop tables, or delete the
  project outright.

## What Relay Labs does not do

- Does not **sell** your data or share it with third parties for their own use.
- Does not use your data for anything other than showing you your own tracking.
- Does not read, store, or transmit the **contents** of your email.
- Does not use the Gmail API or any Google restricted scope.

## Source

Kilroy is open source under the MIT licence:
<https://github.com/RelayLabs-apps/kilroy>. Every claim on this page can be
checked against the code.

## Contact

Relay Labs — <app.relaylabs@gmail.com>. Or open an issue at
<https://github.com/RelayLabs-apps/kilroy/issues>.
