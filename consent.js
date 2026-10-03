// The one consent page. Everything a person agrees to is listed here, and they must accept all of it to use the app.
// It is shown once, and again whenever CONSENT_VERSION changes (change it whenever the wording of a consent changes).
// The rules at the top are pure (no browser, no network). acceptConsents at the bottom talks to Supabase.
import { esc } from "./logic.js?v=10";

export const CONSENT_VERSION = "2026-10-a";
export const AGE_RULE = "US-21";

// Each consent: id, the short label next to the tick box, and the plain-language detail under it.
export const CONSENTS = [
  { id: "age", label: "I am 21 or older.", detail: "This app is for people 21 and older in the United States." },
  { id: "privacy", label: "I have read and accept the privacy policy.", detail: "It explains what the app keeps, why, and how to delete it.", link: { href: "privacy.html", text: "Read the privacy policy" } },
  { id: "photos", label: "Photos I add to wines in the catalog may be shown to other players.", detail: "Each photo is checked by our editors first, and it is shown without your name. You can take any photo back at any time, and it is removed if you delete the entry or your account. Photos of wines you type in yourself are never shared." },
  { id: "prices", label: "Prices I enter may be averaged anonymously.", detail: "The price you enter for a bottle is combined, without your name, with other players' prices to estimate a wine's typical price. Nobody sees your own price." },
];

// accepted: { age: true, ... }. The person can continue only when every consent is ticked.
export const allAccepted = (accepted) => CONSENTS.every((c) => !!(accepted && accepted[c.id]));
export const toggleConsent = (accepted, id) => (CONSENTS.some((c) => c.id === id) ? { ...(accepted || {}), [id]: !(accepted && accepted[id]) } : { ...(accepted || {}) });
export const tickAll = (accepted, on) => Object.fromEntries(CONSENTS.map((c) => [c.id, !!on]));
// Does this person still have to see the page? They do unless they accepted this version (or, before database update 22, this browser did).
export function needsConsent(profile, stored) {
  if (!profile || !profile.age_attested_at) return true;
  return profile.consent_version !== CONSENT_VERSION && stored !== CONSENT_VERSION;
}

export function consentHtml({ accepted = {}, underage = false, busy = false, error = "" } = {}) {
  if (underage) {
    return `<div class="center"><div class="serif" style="font-size:28px;line-height:1.15">This app is for people 21 and older.</div><div class="muted">Come back when you are 21.</div></div>`;
  }
  const rows = CONSENTS.map((c) => `<label class="consent${accepted[c.id] ? " on" : ""}"><input type="checkbox" data-consent="${c.id}"${accepted[c.id] ? " checked" : ""}>
      <span><b>${esc(c.label)}</b><span class="muted small">${esc(c.detail)}${c.link ? ` <a href="${esc(c.link.href)}" target="_blank" rel="noopener">${esc(c.link.text)}</a>` : ""}</span></span></label>`).join("");
  return `<div class="consentpage"><div class="serif" style="font-size:30px;line-height:1.1">A game that learns your palate while teaching you about wine.</div>
    <div class="muted" style="margin:10px 0 4px">Before you start, please agree to the following. You need to accept all of it to use the app.</div>
    ${rows}
    <button class="link" data-consent-all="1">${allAccepted(accepted) ? "Untick all" : "Tick all"}</button>
    <div id="consentErr" class="err">${esc(error)}</div>
    <button class="btn primary" data-consent-go="1"${allAccepted(accepted) && !busy ? "" : " disabled"}>${busy ? "Saving…" : "Accept and continue"}</button>
    <button class="btn outline" data-consent-under="1">I am under 21</button>
    <button class="link" data-account="open:signin">I already have an account</button></div>`;
}

// Records the acceptance. Before database update 22 the two new columns do not exist; the age is still recorded, and the app remembers
// the acceptance in this browser so the person is not asked again and again. Returns the updated profile (or the old one with the fields set).
export async function acceptConsents(sb, userId, profile, remember) {
  const now = new Date().toISOString();
  const full = await sb.from("profiles").update({ age_attested_at: now, age_attested_rule: AGE_RULE, consent_version: CONSENT_VERSION, consent_at: now }).eq("id", userId).select().single();
  if (!full.error) return full.data;
  if (!/consent_(version|at)|column/i.test(String(full.error.message || ""))) throw full.error;
  const age = await sb.from("profiles").update({ age_attested_at: now, age_attested_rule: AGE_RULE }).eq("id", userId).select().single();
  if (age.error) throw age.error;
  if (remember) remember(CONSENT_VERSION);
  return age.data;
}
