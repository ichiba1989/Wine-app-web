// The zoom overlay. Tap the map on the card: the region view opens. Tap again: it zooms to the vineyard (when there is a shape for it). Tap again,
// the close button, outside the box, or Escape: it closes. The region layer scales up from the pin while it fades out and the vineyard layer scales up
// from 0.4 while it fades in (about 0.75 s); with reduced motion on there is only a quick crossfade. The caption changes with each step.
// The rules at the top are pure (no browser); app.js puts the markup on the page and handles the taps.
import { zoomPlan, captionFor, regionViewSvg, vineyardViewSvg, regionPin } from "./maps.js?v=1";
import { esc } from "./logic.js?v=10";

// What a tap does now: the next step number, or null to close.
export const nextStep = (plan, step) => (step + 1 < plan.steps.length ? step + 1 : null);
export const hintFor = (plan, step) => (nextStep(plan, step) === null ? "Tap to close" : "Tap to zoom in");

export function zoomHtml(plan, type = "red", step = 0) {
  const [fx, fy] = regionPin(plan.place), steps = plan.steps.length;
  const vineyard = steps > 1 ? `<div class="layer vineyard">${vineyardViewSvg(plan.detail, type)}</div>` : "";
  const dots = steps > 1 ? `<div class="zdots" aria-hidden="true">${plan.steps.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("")}</div>` : "";
  return `<div class="zoomback" data-zoomback role="dialog" aria-modal="true" aria-label="Where this wine is from">
    <div class="zoombox">
      <button class="zoomx" data-zoomclose aria-label="Close the map">&times;</button>
      <div class="stage" data-zoomstage data-step="${step}" data-steps="${steps}" style="--px:${Math.round(fx * 100)}%;--py:${Math.round(fy * 100)}%" tabindex="0" role="button" aria-label="${esc(hintFor(plan, step))}">
        <div class="layer region">${regionViewSvg(plan.place, type)}</div>${vineyard}
      </div>
      <div class="zcap" data-zoomcap>${esc(captionFor(plan, plan.steps[step]))}</div>
      ${dots}<div class="zhint" data-zoomhint>${esc(hintFor(plan, step))}</div>
    </div></div>`;
}
// Moves an open overlay to a step without redrawing it, so the layers can animate.
export function applyStep(root, plan, step) {
  const stage = root.querySelector("[data-zoomstage]"); if (!stage) return;
  stage.dataset.step = String(step);
  stage.setAttribute("aria-label", hintFor(plan, step));
  const cap = root.querySelector("[data-zoomcap]"); if (cap) cap.textContent = captionFor(plan, plan.steps[step]);
  const hint = root.querySelector("[data-zoomhint]"); if (hint) hint.textContent = hintFor(plan, step);
  root.querySelectorAll(".zdots i").forEach((d, i) => d.classList.toggle("on", i === step));
}
export { zoomPlan };
