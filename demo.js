// "How the card works": a short practice walkthrough. It opens once for a brand-new player (after they accept the terms) and any time from Settings.
// The player practises on a made-up card ("Sample Cellars, Practice Red"; it is not a real wine) with the same gestures as the real one:
// swipe right, left and up, tap the answer buttons, and zoom with the Zoom button, a pinch or a double-tap. NOTHING is saved or sent anywhere.
// The steps and the messages are plain data at the top. The screen is drawn by demoHtml; attachDemo wires the practice card to the page (it touches
// the page, like the other feature controllers); app.js holds the open/next/back/close clicks and remembers that the walkthrough was seen.
import { esc, dragPose, decideSwipe, flyPlan, releaseVelocity, clampN } from "./logic.js?v=11";
import { REACTIONS } from "./reactions.js?v=1";
import { cardHtml } from "./views.js?v=30";

// A card shaped like a catalog card, with made-up names. (Pinot Noir and Oregon only give it a real-looking bottle, flavors and map.)
export const DEMO_CARD = {
  id: "demo", producer: "Sample Cellars", cuvee: "Practice Red", vintage: "2021", style: "red", country: "USA", region: "Oregon", appellation: "Willamette Valley",
  grapes: ["Pinot Noir"], ruleGrapes: [], reach: 3, raw: {}, facts: [{ text: "Pinot Noir", derived: false }, { text: "Oregon, USA", derived: true }],
};
// want: what the player should do on this step (null = just read). The answers match the real card: like, dislike, "I don't know it", "I've had this bottle".
export const STEPS = [
  { id: "right", want: "like", title: "Swipe right if you like it", text: "If a wine looks like something you would enjoy, drag the card to the right." },
  { id: "left", want: "dislike", title: "Swipe left if you don't", text: "If it does not appeal to you, drag the card to the left." },
  { id: "button", want: "dont_know", title: "Not sure? Tap I don't know it", text: "That is fine: it is never counted against you. It helps us show you better wines and quiz questions. Tap I don't know it." },
  { id: "up", want: "had", title: "Swipe up if you've had this bottle", text: "It goes into your Journal so you can rate it. Drag the card up, or tap the small button under the answers." },
  { id: "zoom", want: "zoom", title: "Zoom in to read", text: "Tap the Zoom button under the card. You can also pinch with two fingers, or double-tap the middle of the card. Then tap Reset zoom to go back." },
  { id: "more", want: null, title: "A few more taps", text: "Tap the little map (the one with the magnifier) to see where a wine is from. Tap the wine's name to look it up online. Your answers are kept in the Swipes tab, where you can change one. Likes and dislikes shape your taste profile, and rating wines you have tried adds to it and fills your Bingo cards." },
];
export const DIRECTION = { like: "right", dislike: "left", had: "up" };
// What to tell the player after they do something. kind: "like" | "dislike" | "dont_know" | "had" | "zoom" | "map" | "name".
export function feedback(step, kind) {
  const label = (k) => (REACTIONS[k] || {}).label || k;
  if (kind === "zoom") return step.want === "zoom" ? { ok: true, text: "Zoomed in. Now tap Reset zoom to go back." } : { ok: false, text: "That zooms the card. You can reset it with Reset zoom." };
  if (kind === "map") return { ok: false, text: "In the app, this opens a map of where the wine is from." };
  if (kind === "name") return { ok: false, text: "In the app, this looks the wine up online." };
  if (step.want === kind) return { ok: true, text: `Nice! That is "${label(kind)}".` };
  if (!step.want) return { ok: false, text: `That is "${label(kind)}". Nothing is saved while you practice.` };
  if (step.want === "zoom") return { ok: false, text: `That was "${label(kind)}". For this step, tap Zoom.` };
  if (step.want === "dont_know") return { ok: false, text: `That was "${label(kind)}". For this step, tap "I don't know it".` };
  return { ok: false, text: `That was "${label(kind)}". For this step, swipe ${DIRECTION[step.want]}.` };
}

// ---------------------------------------------------------------- the screen
export function demoHtml(D) {
  const step = STEPS[D.step], last = D.step === STEPS.length - 1;
  const dots = STEPS.map((s, i) => `<span class="ddot${i === D.step ? " on" : D.done[s.id] ? " done" : ""}" aria-hidden="true"></span>`).join("");
  const card = cardHtml(DEMO_CARD).replace('id="card"', 'id="demoCard"');   // not the real #card
  const answerRow = `<div class="answers" role="group" aria-label="Practice answers">${["dislike", "dont_know", "like"].map((k) => `<button class="ans" data-demo-answer="${k}" style="--c:${REACTIONS[k].color}">${esc(REACTIONS[k].label)}</button>`).join("")}</div>`;
  const hadBtn = `<button class="hadbtn" data-demo-answer="had">I've had this bottle</button>`;
  const controls = step.id === "button" ? answerRow
    : step.id === "up" ? `<div class="belowcard">${hadBtn}</div>`
    : step.id === "zoom" ? `<div class="belowcard"><button class="zoombtn" data-demo-zoom aria-label="Zoom in on the card">&#128269; Zoom</button></div>` : "";
  return `<div class="overlay"><div class="sheet demo" id="demoPanel" role="dialog" aria-label="How the card works">
    <div class="sheethead"><div class="sheettitle"><div class="serif big">How the card works</div><div class="muted small">Step ${D.step + 1} of ${STEPS.length}. A practice card, not a real wine: nothing is saved.</div></div>
      <div class="sheetbtns"><button class="link" data-action="demo:close">Skip</button></div></div>
    <div class="dsteps">${dots}</div>
    <h3 class="serif dtitle">${esc(step.title)}</h3><p class="ptext">${esc(step.text)}</p>
    <div class="demostage" id="demoStage">${card}</div>
    ${controls}
    <div class="dnote${D.done[step.id] ? " ok" : ""}" id="demoNote" role="status">${esc(D.note || "")}</div>
    <div class="dnav"><button class="btn outline slim" data-action="demo:back"${D.step === 0 ? " disabled" : ""}>Back</button>
      <button class="btn primary slim" id="demoNext" data-action="${last ? "demo:close" : "demo:next"}">${last ? "Start swiping" : D.done[step.id] || !step.want ? "Next" : "Skip this step"}</button></div>
  </div></div>`;
}

// ---------------------------------------------------------------- the practice card (wires the gestures; nothing is saved)
const reduceMotion = () => document.documentElement.classList.contains("reduce-motion") || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
export function attachDemo(root, D) {
  const el = root && root.querySelector("#demoCard");
  if (!el) return;
  const step = STEPS[D.step], body = el.querySelector(".body"), chip = el.querySelector("[data-zreset]");
  const label = (k) => el.querySelector(`[data-label="${k}"]`);
  const note = root.querySelector("#demoNote"), next = root.querySelector("#demoNext");
  let start = null, dx = 0, dy = 0, samples = [], busy = false, zoomed = false, lastTap = 0;
  const pts = new Map();
  let pinchD0 = 0;
  const paint = () => { label("like").style.opacity = clampN((dx - 40) / 80, 0, 1); label("dislike").style.opacity = clampN((-dx - 40) / 80, 0, 1); label("had").style.opacity = clampN((-dy - 40) / 80, 0, 1); };
  const say = (kind) => {
    const r = feedback(step, kind);
    D.note = r.text; if (r.ok) D.done[step.id] = true;
    if (note) { note.textContent = r.text; note.classList.toggle("ok", !!D.done[step.id]); }
    if (next && step.want && D.done[step.id]) next.textContent = STEPS[D.step + 1] ? "Next" : "Start swiping";
  };
  const setZoom = (on) => {
    zoomed = on; el.classList.toggle("zoomed", on);
    if (chip) chip.hidden = !on;
    body.style.transformOrigin = "50% 30%"; body.style.transition = reduceMotion() ? "none" : "transform 180ms ease-out";
    body.style.transform = on ? "scale(1.8)" : "";
  };
  const settle = () => { el.style.transition = reduceMotion() ? "transform 120ms" : "transform 420ms cubic-bezier(0.34, 1.6, 0.5, 1)"; el.style.transform = ""; dx = dy = 0; paint(); };
  // The card flies off the way it was thrown, then comes back so it can be tried again.
  async function fly(kind, v = { dx: 0, dy: 0, vx: 0, vy: 0 }) {
    busy = true; say(kind);
    const lab = label(kind); if (lab) lab.style.opacity = 1;
    const plan = flyPlan(kind, v.dx, v.dy, v.vx || (kind === "like" ? 0.9 : kind === "dislike" ? -0.9 : 0), v.vy || (kind === "had" ? -1.1 : kind === "dont_know" ? 0.9 : 0), root.clientWidth || 360, 700);
    el.classList.remove("dragging");
    if (el.animate && !reduceMotion()) {
      let anim = null;
      try { anim = el.animate([{ transform: el.style.transform || "translate3d(0,0,0)" }, { transform: `translate3d(${plan.to[0]}px, ${plan.to[1]}px, 0) rotate(${plan.rot}deg)` }], { duration: plan.duration, easing: "cubic-bezier(0.25, 0.6, 0.35, 1)", fill: "forwards" }); await anim.finished; } catch (_) { /* only for show */ }
      if (anim) anim.cancel();   // the "forwards" fill would otherwise hold the card off-screen
    }
    el.style.transition = "none"; el.style.transform = "translate3d(0,0,0) scale(0.96)"; el.style.opacity = "0";
    await new Promise((r) => setTimeout(r, reduceMotion() ? 150 : 450));
    dx = dy = 0; paint();
    el.style.transition = reduceMotion() ? "none" : "transform 260ms ease-out, opacity 260ms ease-out"; el.style.transform = ""; el.style.opacity = "";
    busy = false;
  }
  root.querySelectorAll("[data-demo-zoom]").forEach((b) => b.addEventListener("click", () => { if (zoomed) setZoom(false); else { setZoom(true); say("zoom"); } }));
  root.querySelectorAll("[data-demo-answer]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.demoAnswer; if (!busy) fly(k); }));
  el.addEventListener("click", (ev) => { const a = ev.target.closest && ev.target.closest("a[data-wimg]"); if (a) ev.preventDefault(); if (ev.detail === 0 && ev.target.closest && ev.target.closest("[data-zreset]")) setZoom(false); });
  el.addEventListener("pointerdown", (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; start = null; settle(); return; }
    if (busy || zoomed || pts.size > 1) { start = { x: e.clientX, y: e.clientY, still: true }; return; }
    start = { x: e.clientX, y: e.clientY }; dx = dy = 0; samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    el.style.transition = "none"; el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinchD0) {   // a pinch: spreading zooms in, pinching back zooms out
      const [a, b] = [...pts.values()], r = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinchD0;
      if (r > 1.25 && !zoomed) { setZoom(true); say("zoom"); } else if (r < 0.8 && zoomed) setZoom(false);
      return;
    }
    if (!start || start.still) return;
    dx = e.clientX - start.x; dy = e.clientY - start.y;
    samples.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (samples.length > 8) samples.shift();
    el.style.transform = dragPose(dx, dy).transform; paint();
  });
  el.addEventListener("pointerup", (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchD0 = 0;
    if (!start) return;
    const from = start; start = null;
    const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
    if (!from.still) {
      const { vx, vy } = releaseVelocity(samples), kind = decideSwipe(dx, dy, vx, vy);
      if (kind && !busy) { fly(kind, { dx, dy, vx, vy }); return; }
      settle();
    }
    if (moved >= 18) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    if (hit && hit.closest("[data-zreset]")) { setZoom(false); return; }
    if (hit && hit.closest("[data-zoom]")) { say("map"); return; }
    if (hit && hit.closest("a[data-wimg]")) { say("name"); return; }
    const now = Date.now();
    if (now - lastTap < 450) { lastTap = 0; if (zoomed) setZoom(false); else { setZoom(true); say("zoom"); } } else lastTap = now;   // a double-tap zooms
  });
  el.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); pinchD0 = 0; start = null; settle(); });
}
