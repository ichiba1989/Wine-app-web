// The one consent page. Two ticks: "I am 21 or older" and "I agree to the terms and privacy policy", with all the terms in a small scrolling
// window so everything can be read on one page. They must accept both to use the app.
// It is shown once, and again whenever CONSENT_VERSION changes (change it whenever the wording of the terms changes).
// The rules at the top are pure (no browser, no network). acceptConsents at the bottom talks to Supabase.
import { esc } from "./logic.js?v=10";

export const CONSENT_VERSION = "2026-10-b";
export const AGE_RULE = "US-21";
export const CONTACT_EMAIL = "issei.wine@gmail.com";

export const CONSENTS = [
  { id: "age", label: "I am 21 or older.", detail: "The app is for people 21 and older in the United States." },
  { id: "terms", label: "I have read and agree to the terms and privacy policy.", detail: "This includes photos of catalog wines being shown to other players after an editor checks them, and prices being averaged anonymously." },
];

// The terms, consolidated from the privacy policy page. h = heading, p = paragraphs, ul = a list.
export const TERMS = [
  { h: "Who can use the app", p: ["The app is for people 21 and older in the United States. If we learn that someone under 21 has been using it, we will delete their account."] },
  { h: "Using the app", p: ["This is an early test version and it is provided as it is. It is for fun and for learning about wine, for your own use. It is not health or medical advice, and please drink responsibly. We may change or stop the app, and we may remove content that breaks these terms."] },
  { h: "What we keep", ul: [
    "A guest ID the app creates automatically. It is not your name.",
    "Your email address, only if you choose to save your progress with email or sign in. It is used to send you sign-in codes and links.",
    "That you confirmed you are 21 or older, and when. We do not ask for or store your date of birth.",
    "What you do in the app: wines you swipe on; journal entries (the wine, your verdict, how it tasted, the date, price, food, occasion and notes); photos you add; quiz answers and timed rounds; your trophies; and the palate summary worked out from these.",
    "Feedback you send, such as a report that a wine or a quiz question looks wrong.",
    "Technical information: your browser keeps a sign-in token and a few settings on your device, and the services below see technical details such as your IP address when your device connects to them.",
  ] },
  { h: "How we use it", ul: [
    "To run the app: show your journal and swipes, learn your palate, track your quiz progress, and sign you in.",
    "To improve the wine information and quiz questions, using the feedback people send, and to keep the app working and safe.",
  ] },
  { h: "Photos of wines in the catalog", p: [
    "You agree that photos you add to journal entries for wines in our catalog may be shown to other players. There is no tick box on each photo. Photos of wines you type in yourself are never shared.",
    "Each photo is offered to our editors first. They see the picture and the wine only: not your name, email, notes, price or anything else in your journal. An editor approves or rejects it, and a rejected photo is never shown. An approved photo may appear on that wine's card for every player, and may be copied to other vintages of the same wine. It is shown without your name.",
    "You can take a photo back at any time (tap Shared under the photo). The shared copies are deleted, and also when you delete the photo, the entry or your account. An editor can also take a shared photo down.",
    "Please only add photos of the bottle: no people, children, other personal information or anything you do not have the right to share. By accepting you confirm that photos you add are yours to share. Editors may reject a photo for any reason.",
  ] },
  { h: "Prices", p: ["The price you enter for a bottle stays in your journal. It is also added, without your name, to the other prices entered for the same wine, so the app can show a typical price on that wine's card. An average is used only once at least three different players have entered a price, and it is blended with a price set by our editors. Nobody can see an individual player's price."] },
  { h: "How it tasted and tasting notes", p: ["Your answers about how a wine tasted, and the tasting notes made with the professional tasting grid, belong to your journal entry. They are private to you and only shape your own palate profile. They are deleted when you delete the entry or your account."] },
  { h: "Who else handles it", ul: [
    "Supabase: our database, sign-in system and private storage for your photos.",
    "GitHub Pages: hosts the website.",
    "Brevo: delivers the sign-in emails, only if you use email sign-in.",
    "esm.sh and jsDelivr: deliver a piece of code the app needs; they see your IP address and browser details when it loads.",
  ], p: ["They handle your information only to provide their service. The people who run this app can technically access the database for maintenance and support; each person's data is protected by rules that stop other users from reading it, and photos are kept in private storage (except photos of catalog wines, as above)."] },
  { h: "No selling, no ads", p: ["We do not sell your information, show ads, or use advertising or analytics trackers."] },
  { h: "Deleting your information", ul: [
    "Delete one journal entry or one swipe: it is removed with its notes, food, occasion and photos, including any shared copies of its photos.",
    "Delete your whole account: in the app open Profile, then Overview, then \"Delete my account and all my data\". This erases your account, sign-in, email address, journal, notes, photos (including any you had shared), swipes, quiz history, trophies and palate.",
    "What stays: an anonymous record of the structured part of what you rated or swiped (the wine, the verdict, the structure ratings, the price and the month). It has no name, email, photos or notes, and it is filed under a one-way code so that if you add the same wine again, the new entry replaces it.",
    "We do not currently delete inactive accounts automatically.",
  ] },
  { h: "Your choices and changes", p: ["You can use the app as a guest, change or delete what you add, or delete your account at any time. Depending on where you live you may have further rights, such as asking for a copy of your information. If we change these terms we will update the date and ask you to accept them again. Last updated: October 2026."] },
  { h: "Contact", p: [`Questions or requests: ${CONTACT_EMAIL}`] },
];

// accepted: { age: true, terms: true }. The person can continue only when both are ticked.
export const allAccepted = (accepted) => CONSENTS.every((c) => !!(accepted && accepted[c.id]));
export const toggleConsent = (accepted, id) => (CONSENTS.some((c) => c.id === id) ? { ...(accepted || {}), [id]: !(accepted && accepted[id]) } : { ...(accepted || {}) });
// Does this person still have to see the page? They do unless they accepted this version (or, before database update 22, this browser did).
export function needsConsent(profile, stored) {
  if (!profile || !profile.age_attested_at) return true;
  return profile.consent_version !== CONSENT_VERSION && stored !== CONSENT_VERSION;
}

export function termsHtml() {
  return TERMS.map((s) => `<h4>${esc(s.h)}</h4>${(s.p || []).map((x) => `<p>${linkEmail(x)}</p>`).join("")}${s.ul ? `<ul>${s.ul.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`).join("");
}
// The email address in the text becomes a link.
const linkEmail = (text) => esc(text).replace(esc(CONTACT_EMAIL), `<a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>`);

export function consentHtml({ accepted = {}, underage = false, busy = false, error = "" } = {}) {
  if (underage) {
    return `<div class="center"><div class="serif" style="font-size:28px;line-height:1.15">This app is for people 21 and older.</div><div class="muted">Come back when you are 21.</div></div>`;
  }
  const tick = (c) => `<label class="consent${accepted[c.id] ? " on" : ""}"><input type="checkbox" data-consent="${c.id}"${accepted[c.id] ? " checked" : ""}>
      <span><b>${esc(c.label)}</b><span class="muted small">${esc(c.detail)}</span></span></label>`;
  return `<div class="consentpage"><div class="serif" style="font-size:28px;line-height:1.1">A game that learns your palate while teaching you about wine.</div>
    ${tick(CONSENTS[0])}
    <div class="termshead">Terms and privacy policy <span class="muted small">(scroll to read it all)</span></div>
    <div class="termsbox" tabindex="0" role="region" aria-label="Terms and privacy policy">${termsHtml()}</div>
    <a class="link small" href="privacy.html" target="_blank" rel="noopener">Open the full privacy policy in a new tab</a>
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
