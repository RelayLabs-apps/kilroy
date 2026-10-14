/**
 * Service worker. Sole owner of the Supabase session.
 *
 * Content scripts never hold credentials or talk to Supabase directly — they
 * ask for an operation by name and get a plain result back. MV3 tears this
 * worker down whenever it feels like it, so every piece of state lives in
 * chrome.storage rather than in a module variable.
 */

import * as api from "./api.js";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
// Gmail's legacy ids are hex. Validated rather than trusted, because these go
// straight into a PostgREST in.(…) list.
const LEGACY_HEX_RE = /^[0-9a-f]{6,32}$/i;

const handlers = {
  async status() {
    const config = await api.getConfig();
    if (!config) return { configured: false, signedIn: false };

    const me = await api.whoAmI();
    return {
      configured: true,
      signedIn: Boolean(me),
      email: me?.email ?? null,
      settings: await api.getSettings(),
      base: await api.endpointBase(),
    };
  },

  /**
   * Called when a compose window opens, not when you hit send. Minting the
   * token up front means the pixel is already sitting in the body by the time
   * you send, so we never have to intercept and delay the send itself.
   */
  async createDraft() {
    const me = await api.whoAmI();
    if (!me) throw new Error("Not signed in");

    const token = api.mintToken();
    await api.rest("messages", {
      method: "POST",
      body: { token, status: "draft", user_id: me.userId },
      prefer: "return=minimal",
    });
    return { token };
  },

  async markSent({ token, subject, recipients, threadId }) {
    if (!TOKEN_RE.test(token ?? "")) throw new Error("bad token");
    await api.rest(`messages?token=eq.${token}`, {
      method: "PATCH",
      body: {
        status: "sent",
        subject: subject || null,
        recipients: Array.isArray(recipients) ? recipients : [],
        thread_id: threadId || null,
        sent_at: new Date().toISOString(),
      },
      prefer: "return=minimal",
    });
    return {};
  },

  async registerLink({ messageToken, targetUrl, label }) {
    if (!TOKEN_RE.test(messageToken ?? "")) throw new Error("bad token");
    if (!/^https?:\/\//i.test(targetUrl ?? "")) throw new Error("bad url");

    const rows = await api.rest(`messages?token=eq.${messageToken}&select=id`);
    if (!rows?.length) throw new Error("unknown message");

    const token = api.mintToken();
    await api.rest("links", {
      method: "POST",
      body: {
        message_id: rows[0].id,
        token,
        target_url: targetUrl,
        label: label ? String(label).slice(0, 200) : null,
      },
      prefer: "return=minimal",
    });
    return { token };
  },

  /** "I am looking at this message right now, so don't count what follows." */
  async selfView({ tokens, threadId, legacyIds }) {
    const valid = (tokens ?? []).filter((t) => TOKEN_RE.test(t));
    await Promise.all(
      valid.map((p_token) => {
        const raw = legacyIds?.[p_token] ?? null;
        return api.rpc("note_self_view", {
          p_token,
          p_thread_id: threadId || null,
          p_legacy_message_id: LEGACY_HEX_RE.test(raw ?? "") ? raw : null,
        }).catch(() => {});
      }),
    );
    return { noted: valid.length };
  },

  /**
   * Stats for thread-list rows.
   *
   * Rows are looked up by Gmail's hex MESSAGE id, because that is the only id the
   * thread view exposes (see migration 0004). A row matches when our message
   * either started the thread — the row's data-legacy-thread-id — or is its
   * newest, the row's data-legacy-last-message-id. Callers pass both.
   *
   * Only messages whose thread has been opened since sending have an id on
   * record, so this returns fewer rows than it is asked about by design.
   */
  async statsByThreads({ legacyIds }) {
    const valid = [...new Set((legacyIds ?? []).filter((id) => LEGACY_HEX_RE.test(id)))];
    if (!valid.length) return { rows: [] };
    const rows = await api.rest(
      `message_stats?legacy_message_id=in.(${valid.join(",")})&select=*`,
    );
    return { rows };
  },

  async stats({ tokens }) {
    const valid = (tokens ?? []).filter((t) => TOKEN_RE.test(t));
    if (!valid.length) return { rows: [] };
    const rows = await api.rest(`message_stats?token=in.(${valid.join(",")})&select=*`);
    return { rows };
  },

  async recent({ limit = 25 } = {}) {
    const rows = await api.rest(
      `message_stats?select=*&order=sent_at.desc&limit=${Math.min(Number(limit) || 25, 100)}`,
    );
    return { rows };
  },
};

/**
 * Put a live copy of the content script into Gmail tabs that are already open.
 *
 * Chrome runs content scripts only as pages load. A Gmail tab open when Kilroy
 * is installed has none; one open across a reload or an auto-update keeps the
 * OLD copy, whose every call to this worker now fails — so each message sent
 * from that tab goes out untracked until the tab is reloaded, and Gmail tabs
 * stay open for days. The fresh copy takes over from the stale one (see the
 * hand-off in content.js). Tabs Chrome has discarded can't be injected; they
 * load the script normally when they come back.
 */
async function injectIntoOpenGmailTabs() {
  const script = chrome.runtime.getManifest().content_scripts?.[0];
  if (!script || !chrome.scripting) return;
  const tabs = await chrome.tabs.query({ url: script.matches });
  await Promise.all(tabs.map(async (tab) => {
    if (tab.discarded) return;
    const target = { tabId: tab.id };
    try {
      if (script.css?.length) await chrome.scripting.insertCSS({ target, files: script.css });
      if (script.js?.length) await chrome.scripting.executeScript({ target, files: script.js });
    } catch {
      // Still loading, or not injectable: it runs the script on its own load.
    }
  }));
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  // First install: put the setup page in front of the user rather than leaving
  // them to discover the options page on their own. Only on install —
  // reopening it on every update would be a nuisance.
  if (reason === "install") chrome.runtime.openOptionsPage();
  // An unpacked reload counts as an update too.
  if (reason === "install" || reason === "update") injectIntoOpenGmailTabs();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handler = handlers[msg?.type];
  if (!handler) {
    reply({ ok: false, error: `unknown message: ${msg?.type}` });
    return false;
  }

  Promise.resolve(handler(msg))
    .then((result) => reply({ ok: true, ...result }))
    .catch((err) => reply({ ok: false, error: String(err?.message ?? err) }));

  return true;  // keeps the channel open for the async reply
});
