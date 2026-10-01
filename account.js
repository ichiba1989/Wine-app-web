// Accounts. Everyone starts as a guest (anonymous sign-in). A guest can attach an email address so their
// journal and swipes survive clearing the browser, switching phones, or a long break. The user id stays the
// same, so nothing has to be copied. Someone who already has an account can sign in to it instead.
// Both use a code sent by email (the email also contains a link that does the same thing).
// The rules at the top are pure (no browser, no network). The controller at the bottom talks to Supabase.
import { esc } from "./logic.js?v=5";

export const RESEND_SECONDS = 60;
export const MERGE_KEY = "wine.pendingMerge";    // where the carry-over code waits while the person signs in
export const MERGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// The carry-over code is kept in this browser between asking for it (as a guest) and using it (after sign-in).
export function savePendingMerge(storage, token, guestId, now = Date.now()) { storage.setItem(MERGE_KEY, JSON.stringify({ token, guestId, at: now })); }
export function readPendingMerge(storage, now = Date.now()) {
  try {
    const v = JSON.parse(storage.getItem(MERGE_KEY) || "null");
    if (!v || !v.token || now - v.at > MERGE_MAX_AGE_MS) { storage.removeItem(MERGE_KEY); return null; }
    return v;
  } catch (_) { storage.removeItem(MERGE_KEY); return null; }
}
export const clearPendingMerge = (storage) => storage.removeItem(MERGE_KEY);
// What to tell the person after their guest progress was carried over. Returns "" when there was nothing to carry.
export function mergeMessage(r) {
  const parts = [];
  if (r && r.journal) parts.push(`${r.journal} journal ${r.journal === 1 ? "entry" : "entries"}`);
  if (r && r.swiped) parts.push(`${r.swiped} swiped ${r.swiped === 1 ? "wine" : "wines"}`);
  if (r && r.answers) parts.push(`${r.answers} quiz ${r.answers === 1 ? "answer" : "answers"}`);
  return parts.length ? `Carried over from this phone to your account: ${parts.join(", ")}.` : "";
}
export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());
export const validCode = (s) => /^\d{6,10}$/.test(String(s || "").trim());
export const isGuest = (user) => !!user && user.is_anonymous === true;

// Turns a Supabase error into something a tester can act on. mode is "save" or "signin".
export function friendlyError(err, mode) {
  const raw = String((err && (err.message || err.error_description)) || err || "");
  const m = raw.toLowerCase();
  const code = String((err && err.code) || "").toLowerCase();
  if (code === "email_exists" || m.includes("already been registered") || m.includes("already registered"))
    return "That email already has an account. Choose \"Sign in instead\". What you did as a guest on this phone will be carried over into it.";
  if (code.includes("rate_limit") || (err && err.status === 429) || m.includes("rate limit") || m.includes("security purposes"))
    return "Too many emails were requested just now. Wait a minute and try again.";
  if (code === "otp_disabled" || m.includes("signups not allowed") || m.includes("user not found"))
    return "No account uses that email yet. Use \"Save my progress\" on the phone where you started.";
  if (m.includes("not authorized"))
    return "Email sending is not switched on for that address yet. Ask the person running the app.";
  if (code === "otp_expired" || m.includes("expired") || m.includes("invalid"))
    return "That code is wrong or has expired. Check the newest email, or ask for a new code.";
  if (m.includes("manual linking") || code === "manual_linking_disabled")
    return "Saving progress is not switched on yet. Ask the person running the app to turn on manual linking in Supabase.";
  return "Something went wrong: " + raw;
}

// ---------------------------------------------------------------- drawing
// The card at the bottom of Profile, Overview.
export function accountCardHtml(user) {
  if (!user) return "";
  if (isGuest(user)) {
    return `<div class="pcard"><div class="ptitle">Your account</div>
      <p class="ptext">You are using the app as a guest. Your journal lives only in this browser, so clearing your browsing data, switching phones, or a long break can lose it.</p>
      <button class="btn primary slim" data-account="open:save">Save my progress with email</button>
      <div style="margin-top:8px"><button class="link" data-account="open:signin">I already have an account</button></div></div>`;
  }
  return `<div class="pcard"><div class="ptitle">Your account</div>
    <p class="ptext">Signed in as <b>${esc(user.email || "your email")}</b>. Sign in with this email on any phone to get your journal back.</p>
    <button class="btn outline slim" data-account="signout">Sign out</button></div>`;
}

// canSave: false on the very first screen, where there is nothing yet to save.
function sheetHtml(A, user, canSave) {
  const save = A.mode === "save";
  const title = save ? "Save your progress" : "Sign in";
  const sub = save ? "Add an email so you never lose your journal." : "Use the email you saved your progress with.";
  let body;
  if (A.step === "done") {
    body = `<div class="okbox">Your progress is saved to <b>${esc(A.email)}</b>.</div>
      <p class="ptext">On a new phone, open the app and choose <b>I already have an account</b>, then use this email.</p>
      <button class="btn primary" data-account="close">Done</button>`;
  } else if (A.step === "email") {
    body = `<input class="field" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" data-acct-email placeholder="Your email" value="${esc(A.email)}">
      ${!save && isGuest(user) && canSave ? `<p class="muted small">What you have done as a guest on this phone will be carried over into the account you sign in to.</p>` : ""}
      <div id="acctErr" class="err">${esc(A.error)}</div>
      <button class="btn primary" data-account="send"${A.busy ? " disabled" : ""}>Send me a code</button>
      <div style="margin-top:10px">${save
        ? `<button class="link" data-account="mode:signin">I already have an account</button>`
        : isGuest(user) && canSave ? `<button class="link" data-account="mode:save">New here? Save this phone's progress instead</button>` : ""}</div>`;
  } else {
    body = `<p class="ptext">We sent a code to <b>${esc(A.email)}</b>. Enter it here. Check your junk or spam folder if you do not see it.</p>
      <input class="field codefield" inputmode="numeric" autocomplete="one-time-code" maxlength="10" data-acct-code placeholder="Code" value="${esc(A.code)}">
      ${A.info ? `<div class="okbox">${esc(A.info)}</div>` : ""}
      <div id="acctErr" class="err">${esc(A.error)}</div>
      <button class="btn primary" data-account="verify"${A.busy ? " disabled" : ""}>Confirm</button>
      ${save ? `<button class="btn outline" data-account="link"${A.busy ? " disabled" : ""}>I tapped the link in the email instead</button>` : ""}
      <div class="acctlinks"><button class="link" data-account="resend" id="resendBtn"></button>
        <button class="link" data-account="change">Use a different email</button></div>`;
  }
  return `<div class="overlay"><div class="sheet" id="accountPanel">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">${title}</div><div class="muted small">${sub}</div></div>
      <div class="sheetbtns"><button class="xbtn" data-account="close" aria-label="Close">&times;</button></div></div>${body}</div></div>`;
}

// ---------------------------------------------------------------- controller
// ctx: { sb(), user(), setUser(user), reload(), onClose(), canSave(), prepareMerge() }
export function createAccount(ctx) {
  const A = { open: false, mode: "save", step: "email", email: "", code: "", busy: false, error: "", info: "", resendAt: 0 };
  let timer = null;
  const overlay = () => document.querySelector("#overlay");
  const draw = () => { const o = overlay(); if (o && A.open) { o.innerHTML = sheetHtml(A, ctx.user(), ctx.canSave ? ctx.canSave() : true); paintResend(); } };
  function paintResend() {
    const b = document.getElementById("resendBtn");
    if (!b) return;
    const left = Math.max(0, Math.ceil((A.resendAt - Date.now()) / 1000));
    b.disabled = left > 0; b.textContent = left > 0 ? `Send a new code in ${left}s` : "Send a new code";
  }
  const startTimer = () => { clearInterval(timer); timer = setInterval(paintResend, 500); };
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const setError = (msg) => { A.error = msg; const e = document.getElementById("acctErr"); if (e) e.textContent = msg; };
  const setBusy = (v) => { A.busy = v; document.querySelectorAll("#accountPanel [data-account='send'], #accountPanel [data-account='verify'], #accountPanel [data-account='link']").forEach((b) => { b.disabled = v; }); };

  async function sendCode() {
    const email = A.email.trim();
    if (!validEmail(email)) return setError("Enter a valid email address.");
    setBusy(true); setError("");
    try {
      // Signing in from a guest session switches accounts. Ask for a carry-over code first, while we can still prove this guest is ours.
      // If that fails we stop here, because carrying on would leave the guest's progress behind.
      if (A.mode === "signin" && isGuest(ctx.user()) && ctx.canSave() && ctx.prepareMerge) {
        let token;
        try { token = await ctx.prepareMerge(); } catch (e) { throw new Error("Your progress on this phone cannot be carried over right now, so signing in is paused. (" + (e.message || e) + ")"); }
        savePendingMerge(localStorage, token, ctx.user().id);
      }
      const auth = ctx.sb().auth;
      const res = A.mode === "save" ? await auth.updateUser({ email }) : await auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (res.error) throw res.error;
      A.email = email; A.step = "code"; A.code = ""; A.info = ""; A.resendAt = Date.now() + RESEND_SECONDS * 1000;
      A.busy = false; draw(); startTimer();
    } catch (e) { setBusy(false); setError(friendlyError(e, A.mode)); }
  }
  async function verify() {
    if (!validCode(A.code)) return setError("Enter the code from the email (digits only).");
    setBusy(true); setError("");
    try {
      const auth = ctx.sb().auth;
      const res = await auth.verifyOtp({ email: A.email, token: A.code.trim(), type: A.mode === "save" ? "email_change" : "email" });
      if (res.error) throw res.error;
      if (A.mode === "save") {
        const fresh = (res.data && res.data.user) || (await auth.getUser()).data.user;
        ctx.setUser(fresh); A.step = "done"; A.busy = false; stopTimer(); draw();
      } else { stopTimer(); ctx.reload(); }
    } catch (e) { setBusy(false); setError(friendlyError(e, A.mode)); }
  }
  // If the person tapped the link in the email (possibly in another browser), the account is already confirmed.
  async function checkLink() {
    setBusy(true); setError("");
    try {
      const auth = ctx.sb().auth;
      await auth.refreshSession();
      const { data, error } = await auth.getUser();
      if (error) throw error;
      if (data.user && !isGuest(data.user)) { ctx.setUser(data.user); A.email = data.user.email || A.email; A.step = "done"; A.busy = false; stopTimer(); draw(); }
      else { setBusy(false); setError("It is not confirmed yet. Tap the link in the email, or enter the code."); }
    } catch (e) { setBusy(false); setError(friendlyError(e, A.mode)); }
  }

  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-account]");
    if (!t || t.disabled) return;
    const [action, arg] = t.dataset.account.split(":");
    if (action === "open") { Object.assign(A, { open: true, mode: arg, step: "email", code: "", error: "", info: "", busy: false }); draw(); }
    else if (action === "mode") { A.mode = arg; A.error = ""; draw(); }
    else if (action === "close") { A.open = false; stopTimer(); const o = overlay(); if (o) o.innerHTML = ""; if (ctx.onClose) ctx.onClose(); }
    else if (action === "send") sendCode();
    else if (action === "resend") sendCode();
    else if (action === "change") { stopTimer(); A.step = "email"; A.error = ""; draw(); }
    else if (action === "verify") verify();
    else if (action === "link") checkLink();
    else if (action === "signout") { try { await ctx.sb().auth.signOut(); } finally { ctx.reload(); } }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!t.dataset) return;
    if (t.dataset.acctEmail !== undefined) A.email = t.value;
    else if (t.dataset.acctCode !== undefined) A.code = t.value;
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" || !A.open || A.busy) return;
    if (ev.target.dataset && ev.target.dataset.acctEmail !== undefined) sendCode();
    else if (ev.target.dataset && ev.target.dataset.acctCode !== undefined) verify();
  });

  return { state: A };
}
