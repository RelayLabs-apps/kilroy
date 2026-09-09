import * as api from "./api.js";
import * as mgmt from "./mgmt.js";
import { provision } from "./provision.js";

const $ = (id) => document.getElementById(id);

const STEP_NUMBER = { project: "1", schema: "2", functions: "3", redirect: "4" };

function setStep(id, state, detail) {
  const step = $(`step-${id}`);
  step.dataset.state = state;
  step.querySelector("[data-status]").textContent = detail;
  // A step blocked by an earlier failure isn't itself broken — keep its number
  // rather than flagging it, so the one thing worth fixing stands out.
  step.querySelector(".dot").textContent =
    state === "ok" ? "✓" : state === "bad" ? "!" : STEP_NUMBER[id] ?? "";
}

function say(el, text, kind = "") {
  el.textContent = text;
  el.className = `msg ${kind}`;
}

/**
 * Run every check and reflect it in the account header, the express card, and
 * the numbered (advanced) steps.
 *
 * The numbered steps are ordered deliberately: each one's failure makes the
 * ones below it meaningless, so a single glance shows the first thing actually
 * worth fixing rather than a wall of red. Auth is no longer among them — it
 * lives in the always-visible account header at the top, because on a returning
 * machine signing in is the *only* thing left to do and it shouldn't be buried.
 */
async function runChecks() {
  const stepIds = ["project", "schema", "functions", "redirect"];
  $("summary").textContent = "Checking setup…";
  for (const id of stepIds) {
    const step = $(`step-${id}`);
    step.dataset.state = "busy";
    step.querySelector("[data-status]").textContent = "Checking…";
  }

  const project = await api.checkProject();
  setStep("project", project.ok ? "ok" : "bad", project.detail);

  let schema = { ok: false }, functions = { ok: false };
  if (!project.ok) {
    for (const id of stepIds.slice(1)) setStep(id, "wait", "Waiting on step 1.");
  } else {
    let google;
    [schema, functions, google] = await Promise.all([
      api.checkSchema(),
      api.checkFunctions(),
      api.checkGoogle(project),
    ]);
    setStep("schema", schema.ok ? "ok" : "bad", schema.detail);
    setStep("functions", functions.ok ? "ok" : "bad", functions.detail);
    setStep("redirect", google.ok ? "ok" : "bad", google.detail);
    $("schemaHelp").hidden = schema.ok;
    $("functionsHelp").hidden = functions.ok;
  }

  const auth = await api.checkAuth();
  const signedIn = auth.ok;
  // "Ready" = there is a working backend to sign into. The redirect/Google step
  // isn't required for this: email+password sign-in works without it.
  const backendReady = project.ok && schema.ok && functions.ok;

  // ---- account header (always visible) ----
  $("signedIn").hidden = !signedIn;
  $("signedOut").hidden = signedIn;
  if (signedIn) $("who").textContent = (await api.whoAmI())?.email ?? "unknown";
  // Only offer the sign-in controls once there's actually a backend to reach;
  // otherwise point the user down to setup rather than at a login that can't work.
  $("signinControls").hidden = !backendReady;
  $("signinHint").hidden = backendReady;

  // ---- express one-click card ----
  // Only a machine with no working backend yet needs it. A returning machine
  // (bundled project already reachable) never sees the token prompt — it just
  // signs in above. It also disappears once signed in.
  $("express").hidden = signedIn || backendReady;

  // ---- summary ----
  if (signedIn) {
    $("summary").textContent = "Signed in and ready. Reload Gmail and compose a message.";
  } else if (backendReady) {
    $("summary").textContent = "Project ready — sign in above to finish.";
  } else {
    const failed = [project, schema, functions].filter((c) => !c.ok).length;
    $("summary").textContent = `Set up your project — ${failed} step${failed === 1 ? "" : "s"} to go.`;
  }
}

async function loadForm() {
  const config = await api.getConfig();
  const bundled = await api.configIsBundled();

  // With a bundled project there is nothing to type, so the form collapses to a
  // disclosure and the step reads as done rather than as a chore not yet started.
  $("bundledNote").hidden = !bundled;
  $("projectForm").open = !bundled;
  $("useBundled").hidden = bundled || !(await api.hasBundledConfig());
  if (bundled) $("bundledUrl").textContent = config.url.replace("https://", "");

  if (config) {
    $("url").value = config.url;
    $("anon").value = config.anonKey;
    const ref = config.url.replace(/^https:\/\//, "").split(".")[0];
    $("callbackUrl").textContent = `https://${ref}.supabase.co/auth/v1/callback`;
  }

  try {
    $("redirectUrl").textContent = api.redirectUrl();
  } catch {
    $("redirectUrl").textContent = "Unavailable — reload the extension.";
  }

  const settings = await api.getSettings();
  $("trackPixel").checked = settings.trackPixel;
  $("trackLinks").checked = settings.trackLinks;
}

// ------------------------------------------------------------------ wiring --

$("saveProject").addEventListener("click", async () => {
  say($("projectMsg"), "");
  try {
    await api.setConfig({ url: $("url").value, anonKey: $("anon").value });
    await loadForm();
    await runChecks();
  } catch (err) {
    say($("projectMsg"), err.message, "bad");
    setStep("project", "bad", "Not saved.");
  }
});

$("useBundled").addEventListener("click", async () => {
  say($("projectMsg"), "");
  await api.clearConfig();
  await loadForm();
  await runChecks();
});

$("copyRedirect").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("redirectUrl").textContent);
  $("copyRedirect").textContent = "Copied";
  setTimeout(() => { $("copyRedirect").textContent = "Copy"; }, 1500);
});

$("google").addEventListener("click", async () => {
  const button = $("google");
  button.disabled = true;
  say($("authMsg"), "Opening Google…");
  try {
    await api.signInWithGoogle();
    say($("authMsg"), "");
    await runChecks();
  } catch (err) {
    say($("authMsg"), err.message, "bad");
  } finally {
    button.disabled = false;
  }
});

$("signIn").addEventListener("click", async () => {
  const button = $("signIn");
  button.disabled = true;
  say($("authMsg"), "Signing in…");
  try {
    await api.signIn($("email").value.trim(), $("password").value);
    $("password").value = "";
    say($("authMsg"), "");
    await runChecks();
  } catch (err) {
    say($("authMsg"), err.message, "bad");
  } finally {
    button.disabled = false;
  }
});

$("signOut").addEventListener("click", async () => {
  await api.signOut();
  await runChecks();
});

$("openDash").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

for (const key of ["trackPixel", "trackLinks"]) {
  $(key).addEventListener("change", async (e) => {
    await api.setSettings({ [key]: e.target.checked });
    say($("prefsMsg"), "Saved. Reload Gmail for it to take effect.", "ok");
  });
}

$("recheck").addEventListener("click", runChecks);

// ---------------------------------------------------------- express setup --

// The by-hand steps are reachable from two always-available places — the bottom
// bar in every state, and the link inside the express card — so they can never
// get "lost" behind a card that has since been hidden.
function setManual(show) {
  $("manualWrap").hidden = !show;
  $("advanced").textContent = show ? "Hide advanced" : "Advanced setup";
  if (show) $("manualWrap").scrollIntoView({ behavior: "smooth" });
}

$("advanced").addEventListener("click", () => setManual($("manualWrap").hidden));

$("showManual").addEventListener("click", (e) => {
  e.preventDefault();
  setManual(true);
});

$("findProjects").addEventListener("click", async () => {
  const button = $("findProjects");
  button.disabled = true;
  say($("expMsg"), "Reading your projects…");
  try {
    await mgmt.setToken($("mgmtToken").value);
    const projects = await mgmt.listProjects();
    if (!projects.length) {
      say($("expMsg"), "No projects on that account yet. Create an empty one first, then try again.", "bad");
      return;
    }
    const select = $("projectPick");
    select.textContent = "";
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.ref;
      // Region and status help tell two similarly-named projects apart, and
      // flag one that isn't finished spinning up yet.
      opt.textContent = `${p.name} — ${p.region}${p.status && p.status !== "ACTIVE_HEALTHY" ? ` (${p.status})` : ""}`;
      select.appendChild(opt);
    }
    $("projectPickWrap").hidden = false;
    say($("expMsg"), "");
  } catch (err) {
    say($("expMsg"), err.message, "bad");
  } finally {
    button.disabled = false;
  }
});

$("provision").addEventListener("click", async () => {
  const button = $("provision");
  button.disabled = true;
  $("findProjects").disabled = true;

  const list = $("provStatus");
  list.hidden = false;
  list.textContent = "";
  const rows = new Map();
  const onStep = ({ n, of, label, state, error }) => {
    let li = rows.get(n);
    if (!li) { li = document.createElement("li"); list.appendChild(li); rows.set(n, li); }
    const mark = state === "ok" ? "✓" : state === "bad" ? "✗" : "…";
    li.textContent = `${mark} ${label}${error ? ` — ${error}` : ""}`;
    li.style.color = state === "bad" ? "var(--critical)" : state === "ok" ? "var(--good)" : "var(--text-2)";
  };

  say($("expMsg"), "Setting up… this can take a few seconds per step.");
  try {
    await provision($("projectPick").value, onStep);
    say($("expMsg"), "Backend ready. Create your login to finish.", "ok");
    $("expLogin").hidden = false;
    $("expEmail").focus();
    await loadForm();
    await runChecks();  // reflect the now-green manual steps too
  } catch (err) {
    say($("expMsg"), err.message, "bad");
    // The token may still be needed for a retry, so it is not cleared on failure.
    $("findProjects").disabled = false;
  } finally {
    button.disabled = false;
  }
});

$("expCreate").addEventListener("click", async () => {
  const button = $("expCreate");
  button.disabled = true;
  say($("expMsg"), "Creating your login…");
  try {
    await api.signUp($("expEmail").value.trim(), $("expPass").value);
    $("expPass").value = "";
    say($("expMsg"), "All set. Reload Gmail and compose a message — a Tracking chip appears by Send.", "ok");
    await runChecks();
  } catch (err) {
    say($("expMsg"), err.message, "bad");
  } finally {
    button.disabled = false;
  }
});

(async () => {
  await loadForm();
  await runChecks();
})();
