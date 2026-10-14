/**
 * Kilroy in Gmail.
 *
 * Design note worth reading before changing anything here: the tracking token
 * is minted when a compose window OPENS, not when you press Send. That means
 * the pixel is already in the body by send time and we never have to intercept,
 * delay, or re-dispatch Gmail's send — the single most fragile thing an
 * extension like this can do. Send-time work is one fire-and-forget PATCH that
 * flips the row from 'draft' to 'sent' and attaches subject and recipients.
 *
 * The consequence is orphan draft rows when you abandon a compose. Those are
 * cheap, invisible (message_stats filters on status = 'sent'), and swept up by
 * purge_stale_drafts().
 *
 * Gmail's DOM is unversioned and changes without notice. Every selector below
 * is written to fail soft: if we can't find something, Kilroy does nothing and
 * Gmail behaves exactly as it would without the extension installed.
 */

(() => {
  "use strict";

  const SEL = {
    composeBody: 'div[role="textbox"][g_editable="true"]',
    send: 'div[role="button"][data-tooltip^="Send"], div[role="button"][aria-label^="Send"], div.T-I.aoO[role="button"]',
    subject: 'input[name="subjectbox"]',
    // Current Gmail has NO input[name="to"]. The address fields carry an
    // aria-label and no name at all, which is why recipients came back empty
    // on every message. Keep the named variants for older builds.
    recipientInputs: 'input[name="to"], input[name="cc"], input[name="bcc"], ' +
                     'input[aria-label="To recipients"], input[aria-label="Cc recipients"], ' +
                     'input[aria-label="Bcc recipients"]',
    recipientChips: "[data-hovercard-id], [email]",
  };

  const TOKEN_IN_URL = /\/px\/([A-Za-z0-9_-]{16,64})\.gif/;

  // ----------------------------------------------------- instance hand-off --
  //
  // Chrome never re-runs content scripts in tabs that are already open when the
  // extension is reloaded or auto-updated. The old copy keeps running — its
  // observers fire, it paints chips — but every chrome.* call is dead
  // ("Extension context invalidated"), so each compose it touches goes out
  // untracked until Gmail is reloaded. Gmail tabs stay open for days, which made
  // this the main way tracking stopped without anyone noticing. background.js
  // now injects a fresh copy into open Gmail tabs on install and update; this is
  // how the two copies hand over.

  const INSTANCE = Math.random().toString(36).slice(2);
  document.documentElement.dataset.kilroyInstance = INSTANCE;

  /** False once this copy's extension context is gone (reloaded or updated). */
  function alive() {
    try { return Boolean(chrome.runtime?.id); } catch { return false; }
  }

  /** A newer copy of this script has taken over the page. */
  function superseded() {
    return document.documentElement.dataset.kilroyInstance !== INSTANCE;
  }

  // Take over from any earlier copy: drop its chips and badges, and the pixels
  // it put into composes that are still open — those carry its tokens, whose
  // draft rows will now never be marked sent. Those composes are re-armed with
  // fresh tokens by the scan below. On a normal page load there is nothing here.
  document.querySelectorAll(".kilroy-chip, .kilroy-badge, .kilroy-row-badge")
    .forEach((el) => el.remove());
  document.querySelectorAll('div[role="textbox"] img[data-kilroy]')
    .forEach((el) => el.remove());

  // ------------------------------------------------------------- plumbing --

  function ask(type, payload = {}) {
    if (!alive()) return Promise.resolve({ ok: false, error: "orphaned" });
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          // Fires when the extension is reloaded out from under this page.
          if (chrome.runtime.lastError) {
            return resolve({ ok: false, error: chrome.runtime.lastError.message });
          }
          resolve(res ?? { ok: false, error: "no response" });
        });
      } catch (err) {
        resolve({ ok: false, error: String(err) });
      }
    });
  }

  function debounce(fn, ms) {
    let t = 0;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  /**
   * Leading-edge throttle: runs immediately, then at most once per `ms`.
   *
   * Not interchangeable with debounce here. Gmail rewrites its DOM more or less
   * continuously, so a trailing-edge debounce on a MutationObserver waits for a
   * quiet period that may never arrive — the callback starves, and the UI only
   * catches up on the fallback interval. Throttling reacts on the first
   * mutation and stays bounded after that.
   */
  function throttle(fn, ms) {
    let last = 0;
    let timer = 0;
    return (...args) => {
      const wait = ms - (Date.now() - last);
      if (wait <= 0) {
        last = Date.now();
        fn(...args);
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = 0;
          last = Date.now();
          fn(...args);
        }, wait);
      }
    };
  }

  function ago(iso) {
    if (!iso) return "";
    const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  let statusCache = null;
  let statusAt = 0;

  async function getStatus(force = false) {
    if (!force && statusCache && Date.now() - statusAt < 30_000) return statusCache;
    const res = await ask("status");
    if (res.ok) {
      statusCache = res;
      statusAt = Date.now();
    }
    return statusCache;
  }

  /** Gmail keeps the open thread's id as the last path segment of the hash. */
  function currentThreadId() {
    const parts = location.hash.replace(/^#/, "").split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    return parts.length >= 2 && /^[A-Za-z0-9_-]{10,}$/.test(last) ? last : null;
  }

  // -------------------------------------------------------------- compose --

  const instrumented = new WeakSet();

  /** Nearest ancestor holding both the editor and a Send button. */
  function composeRootFor(bodyEl) {
    let el = bodyEl;
    for (let i = 0; i < 14; i++) {
      el = el.parentElement;
      if (!el) return null;
      if (el.querySelector(SEL.send)) return el;
    }
    return null;
  }

  function injectPixel(bodyEl, base, token) {
    // A pixel carrying some OTHER token — left by an earlier copy of this
    // script, or brought back in a resumed draft — would be counted against a
    // row that is never marked sent. Ours replaces it.
    bodyEl.querySelectorAll("img[data-kilroy]").forEach((el) => {
      if (el.getAttribute("data-kilroy") !== token) el.remove();
    });
    if (bodyEl.querySelector("img[data-kilroy]")) return;
    const img = document.createElement("img");
    img.src = `${base}/px/${token}.gif`;
    img.setAttribute("width", "1");
    img.setAttribute("height", "1");
    img.setAttribute("alt", "");
    img.setAttribute("data-kilroy", token);
    img.style.cssText = "width:1px;height:1px;border:0;display:block;";
    bodyEl.appendChild(img);
    // Your own browser loads this while you compose. Harmless: record_open
    // ignores any token whose row is still 'draft'.
  }

  function removePixel(bodyEl) {
    bodyEl.querySelectorAll("img[data-kilroy]").forEach((el) => el.remove());
  }

  /**
   * Put the chip beside the Send button without putting it *inside* it.
   *
   * Send and its dropdown caret share a wrapper that carries Gmail's blue button
   * background, and Gmail styles its descendants. Anything placed within that
   * wrapper — even after the caret — sits on the blue and gets restyled, which is
   * why earlier attempts looked like a broken piece of the split-button. So the
   * chip goes in as a sibling of the whole group.
   */
  function placeChip(send, chip) {
    const group = send.parentElement;
    const host = group?.parentElement ?? null;

    // Gmail's compose toolbar is table markup in places, and the HTML parser
    // hoists a stray div out of a row — so land in a cell instead.
    if (!host || /^(TR|TBODY|THEAD|TFOOT|TABLE)$/.test(host.tagName)) {
      const cell = send.closest("td");
      (cell ?? group ?? send.parentElement)?.appendChild(chip);
      return;
    }

    host.insertBefore(chip, group.nextSibling);
  }

  function addChip(root) {
    const existing = root.querySelector(".kilroy-chip");
    if (existing) return existing;

    const send = root.querySelector(SEL.send);
    if (!send || !send.parentElement) return null;

    const chip = document.createElement("div");
    chip.className = "kilroy-chip";
    // A switch, not a button: it has an on/off state, and screen readers should
    // say so rather than announcing a press.
    chip.setAttribute("role", "switch");
    chip.setAttribute("tabindex", "0");

    const dot = document.createElement("span");
    dot.className = "kilroy-chip__dot";
    const label = document.createElement("span");
    label.className = "kilroy-chip__label";
    chip.append(dot, label);

    placeChip(send, chip);

    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chip.click(); }
    });

    return chip;
  }

  function paintChip(chip, armed, note, label) {
    if (!chip) return;
    chip.dataset.armed = String(armed);
    chip.setAttribute("aria-checked", String(armed));
    chip.querySelector(".kilroy-chip__label").textContent =
      label ?? (armed ? "Tracking" : "Not tracked");
    chip.setAttribute("aria-label", armed
      ? "Kilroy tracking on for this message"
      : "Kilroy tracking off for this message");
    chip.title = note ?? (armed
      ? "Kilroy will record when this message is opened. Click to turn off."
      : "This message won't be tracked. Click to turn on.");
  }

  /** This copy lost its extension and nothing replaced it: say so, plainly. */
  function paintOrphaned(chip) {
    paintChip(chip, false,
      "Kilroy was updated or reloaded. Reload this Gmail tab (your draft is saved) — until then, this message won't be tracked.",
      "Reload Gmail");
  }

  /**
   * Where the subject and address fields actually live.
   *
   * composeRootFor() returns the nearest ancestor containing a Send button,
   * which in Gmail's current compose is a toolbar wrapper *below* the header —
   * so it holds the body and the Send button but not the subject or recipient
   * rows. Reading fields from it silently yielded empty strings on every
   * message. Scope field reads to the form or dialog instead.
   */
  function fieldScopeFor(bodyEl, root) {
    // Walk up until we reach something that actually holds the header fields.
    // Measured against a live compose: the editor sits 16 levels below the
    // container that has the subject, while the Send button turns up at 14 —
    // hence the two-level gap that made every subject come back empty. There
    // is no <form> and no role="dialog" anywhere on that path, so neither is
    // usable as an anchor; only the presence of the fields themselves is.
    let el = bodyEl;
    for (let i = 0; i < 20 && el.parentElement; i++) {
      el = el.parentElement;
      if (el.querySelector(SEL.subject) || el.querySelector(SEL.recipientInputs)) return el;
    }
    return bodyEl.closest("form") ?? bodyEl.closest('div[role="dialog"]') ?? root;
  }

  // Gmail's compose markup is unversioned and has changed under us more than
  // once. Try progressively wider nets rather than trusting any single one.
  const SUBJECT_SELECTORS = [
    'input[name="subjectbox"]',
    'input[aria-label="Subject"]',
    'input[placeholder="Subject"]',
    // Gmail's own hidden form field, mirrored from the visible box. Last
    // resort: it can lag what you've typed, but it beats an empty string.
    'input[name="subject"]',
  ];

  function readSubject(scope) {
    // Scoped first; then document-wide, which is safe in practice because more
    // than one compose window open at once is rare.
    for (const root of [scope, document]) {
      for (const selector of SUBJECT_SELECTORS) {
        const value = root.querySelector(selector)?.value?.trim();
        if (value) return value;
      }
    }
    // Inline replies have no subject field; they inherit the thread's.
    return document.querySelector("h2.hP")?.textContent?.trim() ?? "";
  }

  function readRecipients(scope) {
    // The hidden inputs are authoritative and exist only inside a compose, so
    // widening to the document can't drag in unrelated addresses.
    for (const root of [scope, document]) {
      const out = new Set();
      root.querySelectorAll(SEL.recipientInputs).forEach((input) => {
        String(input.value ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((addr) => out.add(addr));
      });
      if (out.size) return [...out];
    }

    // Chips are a scoped-only fallback: the same attributes appear on every
    // sender in the thread list, so a document-wide sweep would invent
    // recipients wholesale.
    const out = new Set();
    scope.querySelectorAll(SEL.recipientChips).forEach((el) => {
      if (el.closest('div[role="textbox"]')) return;  // quoted reply, not a recipient
      const addr = el.getAttribute("data-hovercard-id") || el.getAttribute("email");
      if (addr && addr.includes("@")) out.add(addr);
    });
    return [...out];
  }

  /**
   * `armed()` says whether tracking is on for this message; `ensurePixel()` puts
   * the pixel back if editing removed it. The chip's state is the source of
   * truth, not the pixel's presence: a Gemini rewrite, select-all-and-paste, or
   * a signature swap can strip the pixel from the body while the chip still
   * says "Tracking" — and reading that as "you turned it off" sent the message
   * untracked and left the row a draft.
   */
  function hookSend(root, bodyEl, token, armed, ensurePixel) {
    let fired = false;

    const fire = () => {
      if (fired) return;
      // Tracking switched off for this one: leave the row as a draft and let
      // the sweeper collect it.
      if (!armed()) return;
      ensurePixel();
      fired = true;
      const scope = fieldScopeFor(bodyEl, root);
      ask("markSent", {
        token,
        subject: readSubject(scope),
        recipients: readRecipients(scope),
        threadId: currentThreadId(),
      });
    };

    // Gmail may act on mousedown rather than click, so the pixel is made sure
    // of then. markSent itself can wait for the click — it is only a PATCH.
    root.addEventListener("mousedown", (e) => {
      if (armed() && e.target instanceof Element && e.target.closest(SEL.send)) ensurePixel();
    }, true);

    root.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest(SEL.send)) fire();
    }, true);

    root.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") fire();
    }, true);
  }

  function watchLinks(bodyEl, messageToken, base) {
    const sweep = debounce(async () => {
      const anchors = [...bodyEl.querySelectorAll('a[href^="http"]')].filter(
        (a) => !a.dataset.kilroy && !a.href.startsWith(base),
      );

      for (const a of anchors) {
        a.dataset.kilroy = "pending";
        const res = await ask("registerLink", {
          messageToken,
          targetUrl: a.href,
          label: (a.textContent ?? "").trim().slice(0, 120),
        });
        if (res.ok && res.token) {
          a.href = `${base}/r/${res.token}`;
          a.dataset.kilroy = res.token;
        } else {
          // Registration failed, so leave the real URL alone. An unregistered
          // token would just 404 the recipient.
          delete a.dataset.kilroy;
        }
      }
    }, 900);

    new MutationObserver(sweep).observe(bodyEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });
    sweep();
  }

  async function instrumentCompose(bodyEl) {
    if (instrumented.has(bodyEl)) return;

    const root = composeRootFor(bodyEl);
    if (!root) return;  // not a compose, or Gmail hasn't finished rendering it

    // Stay out of Gmail accounts Kilroy isn't signed in as. The content script
    // matches every mail.google.com tab, so it runs in each Google account you
    // have open — but Kilroy is signed in as exactly one, and a message composed
    // in a different account would mint a pixel under the wrong identity and be
    // filed against the wrong person's data. Only bail on a POSITIVE mismatch,
    // and do it BEFORE marking the body instrumented, so an ambiguous or
    // transient account read retries on the next scan instead of disabling the
    // chip for good. Fail open when the account can't be read, so a Gmail
    // selector change never silently disables tracking in the account that IS
    // right.
    const probe = await getStatus();
    if (probe?.ok && probe.signedIn && probe.email) {
      const account = currentAccountEmail();
      if (account && account !== probe.email.toLowerCase()) return;
    }

    instrumented.add(bodyEl);

    // The chip goes up before anything can fail, because an absent chip is
    // indistinguishable from Kilroy not being installed. Crucially it is
    // ALWAYS clickable, and clicking re-attempts arming. The previous version
    // wired the toggle only on the full-success path, so any hiccup at compose
    // time — a cold MV3 service worker, a slow createDraft — left a DEAD chip:
    // greyed, inert to clicks, never retrying, and the message went out with no
    // pixel. That is the "I clicked track but nothing happened / no K" bug.
    const chip = addChip(root);

    let token = null;      // the draft row's token — minted once, on first arm
    let base = null;       // backend base URL, captured alongside the token
    let sendHooked = false;
    let arming = false;

    // Bring the message to the armed state: a pixel in the body, the send and
    // link hooks wired. Safe to call repeatedly — the draft row is minted at
    // most once, the hooks are wired at most once — so a click or a background
    // retry can recover from an earlier transient failure. Returns whether the
    // message is armed.
    async function arm() {
      if (arming) return chip.dataset.armed === "true";
      if (superseded()) return false;  // a newer copy owns this compose now
      if (!alive()) {
        paintOrphaned(chip);
        return false;
      }
      arming = true;
      try {
        const status = await getStatus(true);   // force fresh — wakes a cold SW
        if (!status?.ok) {
          paintChip(chip, false, `Kilroy isn't responding yet (${status?.error ?? "no reply"}). Click to try again.`);
          return false;
        }
        if (!status.signedIn) {
          paintChip(chip, false, "Kilroy is signed out — sign in from its options, then reload Gmail.");
          return false;
        }
        if (!status.settings.trackPixel) {
          paintChip(chip, false, "Tracking is off in Kilroy's options. Turn it on there, then click here.");
          return false;
        }
        if (!token) {
          const draft = await ask("createDraft");
          if (!draft.ok) {
            paintChip(chip, false, `Kilroy couldn't start tracking (${draft.error}). Click to try again.`);
            return false;
          }
          token = draft.token;
          base = status.base;
        }
        injectPixel(bodyEl, base, token);
        paintChip(chip, true);
        if (!sendHooked) {
          const isArmed = () => chip.dataset.armed === "true";
          const ensurePixel = () => injectPixel(bodyEl, base, token);
          hookSend(root, bodyEl, token, isArmed, ensurePixel);
          if (status.settings.trackLinks) watchLinks(bodyEl, token, base);
          // Keep the pixel in the body for as long as tracking is on. It sits
          // last in the editor, where a Gemini rewrite, select-all-and-paste,
          // or a signature swap removes it without anyone seeing.
          new MutationObserver(() => {
            if (isArmed() && !superseded() && !bodyEl.querySelector("img[data-kilroy]")) ensurePixel();
          }).observe(bodyEl, { childList: true, subtree: true });
          sendHooked = true;
        }
        return true;
      } finally {
        arming = false;
      }
    }

    // Click toggles. Armed → turn tracking off (drop the pixel). Not armed →
    // (re)attempt to arm, which heals any earlier transient failure.
    chip?.addEventListener("click", () => {
      if (chip.dataset.armed === "true") {
        removePixel(bodyEl);
        paintChip(chip, false, "This message won't be tracked. Click to turn tracking back on.");
      } else {
        arm();
      }
    });

    // Arm automatically on open. If it fails for a transient reason, keep
    // retrying briefly in the background so the common cold-start case heals
    // itself without the user having to notice — the chip stays clickable the
    // whole time as a manual fallback.
    if (!(await arm())) {
      let tries = 0;
      const retry = setInterval(() => {
        if (chip.dataset.armed === "true" || ++tries > 6 || !document.body.contains(bodyEl)
            || superseded() || !alive()) {
          clearInterval(retry);
          return;
        }
        arm();
      }, 2000);
    }
  }

  // ------------------------------------------------- reading your own mail --

  /**
   * Tracked pixels currently rendered on the page. Gmail rewrites the src to a
   * googleusercontent.com proxy URL but keeps the original after a '#', so the
   * token survives and stays findable.
   *
   * Excludes img[data-kilroy] — that's a pixel we just injected into a compose
   * window, and the message hasn't been sent yet.
   */
  function renderedTokens() {
    const found = new Map();
    for (const img of document.querySelectorAll('img[src*="/px/"]')) {
      if (img.hasAttribute("data-kilroy")) continue;
      const match = TOKEN_IN_URL.exec(img.src ?? "");
      if (match) found.set(match[1], img);
    }
    return found;
  }

  /**
   * Which Google account this tab is signed into — the account, never the
   * address you're sending as. A send-as alias (you@mit.edu inside your
   * you@gmail.com Gmail) is still this account.
   *
   * Gmail's title ends "… - you@gmail.com - Gmail" in every view, including a
   * popped-out compose, so read the LAST address in it (a subject can carry an
   * address too, but always earlier). Failing that, the Google Account button
   * and only it: the old page-wide sweep took the first aria-label with an "@"
   * in it, which a recipient chip or a From field could beat to the front.
   */
  function currentAccountEmail() {
    const inTitle = document.title.match(/[\w.+-]+@[\w.-]+\.\w{2,}/g);
    if (inTitle) return inTitle[inTitle.length - 1].toLowerCase();

    const button = document.querySelector(
      'a[aria-label^="Google Account"], header [aria-label*="@"], #gb [aria-label*="@"]',
    );
    const found = /[\w.+-]+@[\w.-]+\.\w{2,}/.exec(button?.getAttribute("aria-label") ?? "");
    return found ? found[0].toLowerCase() : null;
  }

  /**
   * Gmail's hex id for the message this pixel is embedded in.
   *
   * Measured, after 0003 assumed the thread id and captured nothing 8 times out
   * of 8: the thread view carries no data-legacy-thread-id anywhere. What it does
   * carry is data-legacy-message-id, on an ancestor of the pixel. Every
   * thread-level id in the document belongs to a list row rendered alongside, and
   * none of those contains the pixel — which is exactly why this reads only from
   * ancestors. A document-wide search would return a neighbouring thread's id and
   * badge the wrong message with total confidence.
   *
   * See 0004 for why a message id is enough to find a list row.
   */
  function legacyMessageIdFor(img) {
    return img.closest("[data-legacy-message-id]")
      ?.getAttribute("data-legacy-message-id") ?? null;
  }

  function badgeHostFor(img) {
    const body = img.closest(".a3s");
    const item = (body ?? img).closest('[role="listitem"]');
    return item?.querySelector(".gE") ?? item?.querySelector(".gH") ?? body ?? null;
  }

  function paintBadge(img, row) {
    const host = badgeHostFor(img);
    if (!host) return;

    let badge = host.querySelector(":scope > .kilroy-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "kilroy-badge";
      const k = document.createElement("span");
      k.className = "kilroy-badge__k";
      k.textContent = "K";
      const text = document.createElement("span");
      text.className = "kilroy-badge__text";
      badge.append(k, text);
      host.appendChild(badge);
    }

    const opens = Number(row?.open_count ?? 0);
    const prefetches = Number(row?.prefetch_count ?? 0);
    const clicks = Number(row?.click_count ?? 0);

    // On screen: the mark and a number. Everything else in the tooltip — this
    // sits in a thread header you read every day.
    let state = "unopened";
    let short = "";
    let detail = "Sent. No open recorded yet.";

    if (opens > 0) {
      state = "opened";
      short = String(opens);
      detail = opens === 1
        ? `Opened ${ago(row.first_open_at)}.`
        : `${opens} opens. First ${ago(row.first_open_at)}, last ${ago(row.last_open_at)}.`;
    } else if (prefetches > 0) {
      state = "prefetch";
      detail = "Delivered, but every fetch so far looks automated — a scanner or a privacy prefetch. Not evidence it was read.";
    }

    if (clicks > 0) {
      short = short ? `${short}·${clicks}` : `0·${clicks}`;
      detail += ` ${clicks} link click${clicks === 1 ? "" : "s"}.`;
    }
    if (prefetches > 0 && opens > 0) {
      detail += ` ${prefetches} automated fetch${prefetches === 1 ? "" : "es"} discounted.`;
    }

    badge.dataset.state = state;
    badge.querySelector(".kilroy-badge__text").textContent = short;
    badge.title = `Kilroy — ${detail}`;
  }

  // Last known numbers per token. Gmail tears down and rebuilds thread DOM
  // constantly, taking our badge with it. Without a cache the badge stays gone
  // until the next network round trip completes, which is most of what made
  // this feel sluggish — the data was already here, we just weren't drawing it.
  const statsCache = new Map();
  let lastFetch = 0;

  // Tokens whose self-view we've already reported this render.
  //
  // Gmail fetches a pixel ONCE, when the message renders — not repeatedly
  // while you read. So one claim per render is all that's ever needed, and
  // claiming continuously was actively destructive: every heartbeat reached
  // back 20s and rewrote any genuine open that had landed in the meantime.
  // Entries are dropped when a message leaves the screen, so returning to a
  // thread (a fresh render, hence a fresh fetch) claims again.
  const claimed = new Set();

  /** Redraw from cache. Synchronous and cheap; safe on every mutation. */
  function paintFromCache(rendered) {
    for (const [token, img] of rendered) paintBadge(img, statsCache.get(token));
  }

  /**
   * Tell the backend you're looking at these messages, so its own fetch of the
   * pixel isn't counted as the recipient opening it, and refresh the numbers.
   */
  async function pulse({ force = false } = {}) {
    if (document.hidden || superseded()) return;

    const rendered = renderedTokens();
    if (!rendered.size) return;

    paintFromCache(rendered);
    if (!force && Date.now() - lastFetch < 1_500) return;
    lastFetch = Date.now();

    const tokens = [...rendered.keys()];

    // Only the account Kilroy is signed in as may suppress its opens.
    //
    // This content script matches mail.google.com for every account you're
    // signed into, not just the sending one. Read your own mail in a second
    // Gmail account in the same browser and, without this check, that read
    // cancels out the very open you were trying to observe. So when this tab is
    // plainly a different Google account than Kilroy's, we are the recipient
    // here and must stay quiet.
    //
    // This used to compare the viewer with each message's From address, which
    // misread everything sent from a send-as alias (From: you@mit.edu, viewer:
    // you@gmail.com) as someone else's mail — so your own re-reads of it were
    // counted as opens. Claiming every rendered token is safe: note_self_view
    // ignores any token that isn't the caller's own, so mail other Kilroy users
    // sent you is untouched.
    const viewer = currentAccountEmail();
    const kilroyAccount = (await getStatus())?.email?.toLowerCase() ?? null;
    const ours = viewer && kilroyAccount && viewer !== kilroyAccount ? [] : tokens;

    // Forget messages that have left the screen; seeing them again means a new
    // render and a new fetch to account for.
    for (const token of claimed) {
      if (!rendered.has(token)) claimed.delete(token);
    }

    // Claim only what we haven't claimed yet, and only when this tab is
    // genuinely in front of you — a Gmail tab open in a background window
    // would otherwise suppress real opens for as long as it sat there.
    const fresh = ours.filter((token) => !claimed.has(token));
    const claiming = document.hasFocus() && fresh.length;
    if (claiming) fresh.forEach((token) => claimed.add(token));

    // Per-message, so each token reports its own id rather than borrowing the
    // first one's.
    const legacyIds = new Map(
      tokens.map((token) => [token, legacyMessageIdFor(rendered.get(token))]),
    );

    // Both at once. These used to run in series, which doubled the wait for no
    // benefit: note_self_view reaches back a few seconds to reclassify, so it
    // doesn't need to land before the read to stay correct.
    const [, stats] = await Promise.all([
      claiming
        ? ask("selfView", {
            tokens: fresh,
            threadId: currentThreadId(),
            legacyIds: Object.fromEntries(fresh.map((t) => [t, legacyIds.get(t) ?? null])),
          })
        : Promise.resolve(null),
      ask("stats", { tokens }),
    ]);

    if (!stats?.ok) return;
    for (const row of stats.rows ?? []) statsCache.set(row.token, row);
    paintFromCache(renderedTokens());
  }

  // ------------------------------------------------------- thread-list badges --

  // legacy thread id -> stats row, or null for "asked, not tracked". Caching the
  // misses matters as much as the hits: without it, every scroll re-asks about
  // the same fifty untracked threads.
  const listStats = new Map();
  let lastListFetch = 0;

  function paintRowBadge(host, row) {
    let badge = host.querySelector(":scope > .kilroy-row-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "kilroy-row-badge";
      host.insertBefore(badge, host.firstChild);
    }

    const opens = Number(row.open_count ?? 0);
    const prefetches = Number(row.prefetch_count ?? 0);

    badge.dataset.state = opens > 0 ? "opened" : prefetches > 0 ? "prefetch" : "unopened";
    badge.textContent = opens > 0 ? `K ${opens}` : "K";
    badge.title = opens > 0
      ? `Kilroy — opened ${opens} time${opens === 1 ? "" : "s"}, last ${ago(row.last_open_at)}`
      : prefetches > 0
        ? "Kilroy — delivered, but every fetch so far looks automated"
        : "Kilroy — sent, no confirmed open yet";
  }

  async function paintListBadges() {
    // Two candidate ids per row: the thread's own (which is its first message's)
    // and its newest message's. Our message matches one or the other depending on
    // whether it started the thread or replied to it — see migration 0004.
    const rows = [];
    for (const tr of document.querySelectorAll('tr[role="row"]')) {
      const span = tr.querySelector("[data-legacy-thread-id]");
      if (!span) continue;
      const ids = [
        span.getAttribute("data-legacy-thread-id"),
        span.getAttribute("data-legacy-last-message-id"),
      ].filter(Boolean);
      if (ids.length) rows.push({ tr, span, ids });
    }
    if (!rows.length) return;

    const wanted = [...new Set(rows.flatMap((r) => r.ids))];
    const unknown = wanted.filter((id) => !listStats.has(id));

    if (unknown.length && Date.now() - lastListFetch > 5_000) {
      lastListFetch = Date.now();
      const res = await ask("statsByThreads", { legacyIds: unknown });
      if (res.ok) {
        for (const row of res.rows ?? []) listStats.set(row.legacy_message_id, row);
        for (const id of unknown) if (!listStats.has(id)) listStats.set(id, null);
      }
    }

    for (const { span, ids } of rows) {
      const match = ids.map((id) => listStats.get(id)).find(Boolean);
      if (match && span.parentElement) paintRowBadge(span.parentElement, match);
    }
  }

  // --------------------------------------------------------------- driver --

  const scan = throttle(() => {
    if (superseded()) return standDown();
    if (!alive()) {
      // Nothing replaced this copy — injection failed, or the extension was
      // turned off. Make every chip say what's wrong rather than look armed.
      document.querySelectorAll(".kilroy-chip").forEach(paintOrphaned);
    }
    paintListBadges().catch(() => {});
    document.querySelectorAll(SEL.composeBody).forEach((el) => {
      instrumentCompose(el).catch(() => {});
    });
    pulse().catch(() => {});
  }, 250);

  const pulseNow = () => pulse({ force: true }).catch(() => {});
  const onVisible = () => { if (!document.hidden) pulseNow(); };

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", pulseNow);
  window.addEventListener("hashchange", pulseNow);
  const heartbeat = setInterval(() => pulse().catch(() => {}), 5_000);

  /** A newer copy has taken over the page; get out of its way entirely. */
  function standDown() {
    observer.disconnect();
    clearInterval(heartbeat);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", pulseNow);
    window.removeEventListener("hashchange", pulseNow);
  }

  scan();
})();
