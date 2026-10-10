// The one consent page. Two ticks: "I am 21 or older" and "I accept the terms and conditions", where the words link to the full terms and privacy
// policy (privacy.html, the one place the terms are written). A small scrolling window shows that same page (an iframe, so the text is never copied here).
// They must accept both to use the app.
// It is shown once, and again whenever CONSENT_VERSION changes (change it whenever the wording of the terms changes).
// The rules at the top are pure (no browser, no network). acceptConsents at the bottom talks to Supabase.
import { esc } from "./logic.js?v=11";

export const CONSENT_VERSION = "2026-10-e";
export const AGE_RULE = "US-21";
export const CONTACT_EMAIL = "issei.wine@gmail.com";

// link: the words in the label that become a link to the terms page.
export const TERMS_URL = "privacy.html";
export const CONSENTS = [
  { id: "age", label: "I am 21 or older." },
  { id: "terms", label: "I accept the terms and conditions.", link: "terms and conditions" },
];

// accepted: { age: true, terms: true }. The person can continue only when both are ticked.
export const allAccepted = (accepted) => CONSENTS.every((c) => !!(accepted && accepted[c.id]));
export const toggleConsent = (accepted, id) => (CONSENTS.some((c) => c.id === id) ? { ...(accepted || {}), [id]: !(accepted && accepted[id]) } : { ...(accepted || {}) });
// Does this person still have to see the page? They do unless they accepted this version (or, before database update 22, this browser did).
export function needsConsent(profile, stored) {
  if (!profile || !profile.age_attested_at) return true;
  return profile.consent_version !== CONSENT_VERSION && stored !== CONSENT_VERSION;
}

// The label, with the linked words (if any) as a link that opens the terms in a new tab.
const labelHtml = (c) => {
  const text = esc(c.label);
  return c.link ? text.replace(esc(c.link), `<a href="${TERMS_URL}" target="_blank" rel="noopener">${esc(c.link)}</a>`) : text;
};

export function consentHtml({ accepted = {}, underage = false, busy = false, error = "" } = {}) {
  if (underage) {
    return `<div class="center"><div class="serif" style="font-size:28px;line-height:1.15">This app is for people 21 and older.</div><div class="muted">Come back when you are 21.</div></div>`;
  }
  const tick = (c) => `<label class="consent${accepted[c.id] ? " on" : ""}"><input type="checkbox" data-consent="${c.id}"${accepted[c.id] ? " checked" : ""}>
      <span><b>${labelHtml(c)}</b></span></label>`;
  return `<div class="consentpage"><div class="serif" style="font-size:28px;line-height:1.1">A game that learns your palate while teaching you about wine.</div>
    ${tick(CONSENTS[0])}
    <div class="termshead">Terms and conditions <span class="muted small">(scroll to read it all)</span></div>
    <div class="termsbox"><iframe src="${TERMS_URL}?embed=1" title="Terms and conditions and privacy policy" loading="eager"></iframe></div>
    ${tick(CONSENTS[1])}
    <div id="consentErr" class="err">${esc(error)}</div>
    <button class="btn primary" data-consent-go="1"${allAccepted(accepted) && !busy ? "" : " disabled"}>${busy ? "Saving\u2026" : "Accept and continue"}</button>
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
