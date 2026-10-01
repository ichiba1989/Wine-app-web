// Feedback from testers: a short form, opened from Profile, Overview. Editors read it in the Editor tab.
// The rules at the top are pure (no browser, no network). The controller at the bottom talks to Supabase.
import { esc } from "./logic.js?v=9";

export const KINDS = [
  { id: "bug", label: "Something is broken" },
  { id: "confusing", label: "Something is confusing" },
  { id: "idea", label: "I have an idea" },
  { id: "other", label: "Something else" },
];
export const MAX_MESSAGE = 2000;
const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());

// Returns a message for the first problem, or "" when the feedback can be sent.
export function validateFeedback(f) {
  if (!KINDS.some((k) => k.id === f.kind)) return "Choose what kind of feedback this is.";
  const m = String(f.message || "").trim();
  if (!m) return "Write a few words about it.";
  if (m.length > MAX_MESSAGE) return `Please keep it under ${MAX_MESSAGE} characters.`;
  const e = String(f.email || "").trim();
  if (e && !validEmail(e)) return "That email address does not look right. Leave it empty if you do not want a reply.";
  return "";
}
// The row saved to the database. Which screen and what kind of phone help us reproduce a problem.
export function feedbackRow(f, userId, env) {
  return {
    user_id: userId, kind: f.kind, message: String(f.message).trim(),
    screen: String(env.screen || "").slice(0, 60), app_version: String(env.version || "").slice(0, 40),
    device: String(env.device || "").slice(0, 200), contact_email: String(f.email || "").trim() || null,
  };
}

// The card in Profile, Overview.
export const feedbackCardHtml = () => `<div class="pcard"><div class="ptitle">Help us improve</div>
  <p class="ptext">Tell us what is broken, confusing, or missing. It takes a minute and we read every message.</p>
  <button class="btn outline slim" data-feedback="open">Send feedback</button></div>`;

function sheetHtml(F) {
  if (F.done) {
    return `<div class="overlay"><div class="sheet" id="feedbackPanel"><div class="sheethead"><div class="sheettitle"><div class="serif big">Thank you</div></div>
      <div class="sheetbtns"><button class="xbtn" data-feedback="close" aria-label="Close">&times;</button></div></div>
      <div class="okbox">Your feedback was sent. We read every message.</div><button class="btn primary" data-feedback="close">Done</button></div></div>`;
  }
  const kinds = KINDS.map((k) => `<button class="vbtn${F.kind === k.id ? " on" : ""}" data-feedback="kind:${k.id}">${esc(k.label)}</button>`).join("");
  return `<div class="overlay"><div class="sheet" id="feedbackPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">Send feedback</div><div class="muted small">Short is fine. Say what you tried and what happened.</div></div>
      <div class="sheetbtns"><button class="xbtn" data-feedback="close" aria-label="Close">&times;</button></div></div>
    <div class="verdicts">${kinds}</div>
    <textarea class="field" rows="5" data-fb-message maxlength="${MAX_MESSAGE}" placeholder="What happened?">${esc(F.message)}</textarea>
    <input class="field" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" data-fb-email placeholder="Your email, only if you would like a reply (optional)" value="${esc(F.email)}">
    <div class="muted small">We also note which screen you were on and what kind of phone you use, to help us fix things.</div>
    <div id="fbErr" class="err">${esc(F.error)}</div>
    <button class="btn primary" data-feedback="send"${F.sending ? " disabled" : ""}>Send</button></div></div>`;
}

// ctx: { sb(), user(), screen(), version() }
export function createFeedback(ctx) {
  const F = { open: false, kind: null, message: "", email: "", sending: false, error: "", done: false };
  const overlay = () => document.querySelector("#overlay");
  const draw = () => { const o = overlay(); if (o && F.open) o.innerHTML = sheetHtml(F); };
  const setError = (m) => { F.error = m; const e = document.getElementById("fbErr"); if (e) e.textContent = m; };

  async function send() {
    if (F.sending) return;
    const problem = validateFeedback(F);
    if (problem) return setError(problem);
    F.sending = true; setError("");
    document.querySelectorAll("#feedbackPanel [data-feedback='send']").forEach((b) => { b.disabled = true; });
    try {
      const u = ctx.user();
      const row = feedbackRow(F, u.id, { screen: ctx.screen(), version: ctx.version(), device: navigator.userAgent });
      const { error } = await ctx.sb().from("app_feedback").insert(row);
      if (error) throw error;
      F.done = true; F.sending = false; draw();
    } catch (e) {
      F.sending = false; draw(); setError("Could not send: " + (e.message || e) + " Your words are still here, so you can try again.");
    }
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-feedback]");
    if (!t || t.disabled) return;
    const [action, arg] = t.dataset.feedback.split(":");
    if (action === "open") {
      const u = ctx.user();
      Object.assign(F, { open: true, kind: null, message: "", error: "", sending: false, done: false, email: (u && u.email) || "" });
      draw();
    } else if (action === "kind") { F.kind = arg; draw(); }
    else if (action === "send") send();
    else if (action === "close") { F.open = false; const o = overlay(); if (o) o.innerHTML = ""; }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t.dataset) return;
    if (t.dataset.fbMessage !== undefined) F.message = t.value;
    else if (t.dataset.fbEmail !== undefined) F.email = t.value;
  });
  return { state: F };
}
