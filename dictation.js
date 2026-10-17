// Speaking notes: the browser's own speech recognition (Chrome, Edge, Safari). Where it is missing, the notes box still works by typing, or with the microphone key on the phone's keyboard.
// Talks to the browser only; the text rules are in notes.js. The browser may send the audio to its maker's speech service (the terms and privacy policy say so).
let microphoneKnown = null;   // "granted" once this page has the microphone
export const dictationSupported = () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
// ------- asking for the microphone
// Some browsers only listen after the page has asked for the microphone itself, and a page that never asks can look as if it is blocked. askMicrophone() puts the
// browser's own "Allow microphone?" question on screen (it needs a tap to run, and a secure https page), then lets go of the microphone straight away:
// listening is done by the speech recognition below. microphoneState() says what the browser already knows without asking.
const HOW_TO_ALLOW = "The microphone is turned off for this site. Tap the lock or settings icon next to the web address, allow Microphone, then tap Speak again. You can also type your note.";
export async function microphoneState() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return "unknown";
    const r = await navigator.permissions.query({ name: "microphone" });
    return r.state === "granted" || r.state === "denied" || r.state === "prompt" ? r.state : "unknown";
  } catch (_) { return "unknown"; }
}
// Resolves to { ok: true } or { ok: false, reason, message } with plain words for the player.
export async function askMicrophone() {
  if (typeof window !== "undefined" && window.isSecureContext === false) return { ok: false, reason: "insecure", message: "The microphone only works on a secure (https) page. You can type your note instead." };
  const md = typeof navigator !== "undefined" && navigator.mediaDevices;
  if (!md || !md.getUserMedia) return { ok: true, reason: "unsupported" };   // nothing to ask with: let the speech recognition ask for itself
  try {
    const stream = await md.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    const name = e && e.name;
    if (name === "NotFoundError" || name === "DevicesNotFoundError") return { ok: false, reason: "none", message: "No microphone was found. You can type your note instead." };
    if (name === "NotReadableError" || name === "TrackStartError") return { ok: false, reason: "busy", message: "The microphone is being used by another app. Close it and tap Speak again, or type your note." };
    return { ok: false, reason: "denied", message: HOW_TO_ALLOW };   // NotAllowedError, SecurityError, or anything else: the person said no or the browser did
  }
}
const WORDS = {
  "not-allowed": HOW_TO_ALLOW,
  "service-not-allowed": HOW_TO_ALLOW,
  "audio-capture": "No microphone was found. You can type your note instead.",
  "network": "Listening needs an internet connection. You can type your note instead.",
};
// onText(finalText, interimText): everything heard so far in this session (final) and what is still being heard (interim).
// onState(listening): true while the microphone is on. onError(message): plain words for the player. onClear(): the last error is out of date (a new try started, or listening was stopped).
// onNote(message): a short status ("Asking for the microphone...") shown while the browser's question is on screen.
// The microphone being allowed and the browser's SPEECH RECOGNITION being allowed are two different things (Safari and Chrome on iPhone ask for both and have a Dictation switch;
// some browsers refuse speech recognition even when the microphone works). So an error from the recognition after the microphone was allowed is explained as a speech problem, not a blocked microphone.
const SPEECH_OFF = "The microphone is allowed, but this browser will not let the page turn speech into text. You can still dictate: tap the microphone key on your keyboard while the notes box is open. On an iPhone, also check Settings > General > Keyboard > Enable Dictation and Privacy & Security > Speech Recognition.";
// The iPhone home-screen app (and some in-app browsers) have no speech recognition at all, whatever the permissions say.
const STANDALONE_OFF = "Speech recognition is not available in the home-screen app. Open the site in Safari or Chrome to speak, or tap the microphone key on your keyboard to dictate here, or just type.";
const isStandalone = () => { try { return !!(navigator.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)); } catch (_) { return false; } };
const TAP_AGAIN = "The microphone is allowed now. Tap Speak once more.";
// options(): { lang, phrases } read each time listening starts: lang is a language code ('' = the phone's), phrases are [{ phrase, boost }] the browser may favour (contextual biasing; only where supported).
export function createDictation({ onText, onState, onError, onNote, onClear, options }) {
  let rec = null, finals = "", on = false, asking = false, cancelled = false, justAsked = false, lastAsk = 0, retried = false;
  const set = (v) => { if (on === v) return; on = v; if (onState) onState(v); };
  const clear = () => { if (onClear) onClear(); };
  // Whatever happened, listening is over: let go of the recognition and show the button as off, so it can be tapped again (the browser does not always send "end" after an error).
  function reset() { const r = rec; rec = null; if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort ? r.abort() : r.stop(); } catch (_) {} } set(false); }
  // reason "speech": the microphone is fine but the browser will not do speech to text. The page can still offer the keyboard's own dictation (the app focuses the notes box).
  const fail = (message, reason) => { reset(); if (onError) onError(message, reason); };
  // Once the browser has said yes, later taps start straight away (Safari wants listening to start right after the tap). The first tap asks first.
  async function start() {
    if (on || asking) return;
    cancelled = false; justAsked = false; retried = false; clear();
    if (microphoneKnown !== "granted") {
      asking = true;
      if (onNote) onNote("Asking for the microphone...");
      const st = await microphoneState();
      let res = { ok: true };
      if (st === "denied") res = { ok: false, reason: "denied", message: HOW_TO_ALLOW };
      else if (st !== "granted") res = await askMicrophone();
      asking = false;
      if (onNote) onNote("");
      if (cancelled) return;   // the player tapped again or closed the sheet while the browser was asking
      if (!res.ok) { if (onError) onError(res.message); return; }
      if (res.reason !== "unsupported") { microphoneKnown = "granted"; justAsked = true; lastAsk = Date.now(); }
    }
    begin();
  }
  function begin(simple = false) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { fail("This browser cannot listen. Type your note, or use the microphone key on your keyboard."); return; }
    finals = "";
    try {
      rec = new Ctor();
      const opt = (options && options()) || {};
      rec.lang = opt.lang || navigator.language || "en-US";
      // Where the browser can take a list of words to listen for (SpeechRecognition.phrases), give it the wine words that matter now. Silently skipped everywhere else.
      try { if (opt.phrases && opt.phrases.length && "phrases" in rec && typeof window.SpeechRecognitionPhrase === "function") rec.phrases = opt.phrases.map((x) => new window.SpeechRecognitionPhrase(x.phrase, x.boost)); } catch (_) {}
      rec.continuous = !simple; rec.interimResults = !simple;   // "simple" is the gentlest setting, tried once when the first try is refused
      rec.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i], t = r[0] ? r[0].transcript : "";
          if (r.isFinal) finals += (finals ? " " : "") + t.trim(); else interim += t;
        }
        if (onText) onText(finals, interim.trim());
      };
      rec.onerror = (ev) => {
        const e = ev && ev.error;
        if (e === "no-speech" || e === "aborted") return;   // quiet is not a failure; "end" follows
        if (e === "not-allowed" || e === "service-not-allowed") {
          // Right after the first "Allow", some browsers refuse because the tap that started this is already used up: the next tap works.
          if (microphoneKnown !== "granted") { fail(HOW_TO_ALLOW); return; }
          if (!simple && !retried) {   // some browsers refuse the continuous kind, or the first try right after the question: try once more, plainly
            retried = true; const r = rec; rec = null; if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort ? r.abort() : r.stop(); } catch (_) {} }
            set(false); begin(true); return;
          }
          if (isStandalone()) fail(STANDALONE_OFF, "speech");
          else fail(justAsked && Date.now() - lastAsk < 5000 ? TAP_AGAIN : SPEECH_OFF, "speech");
          return;
        }
        fail(WORDS[e] || "Could not listen (" + e + "). You can type your note instead.");
      };
      rec.onend = () => { rec = null; set(false); };
      rec.start(); set(true);
    } catch (e) { fail("Could not start the microphone. You can type your note instead."); }
  }
  // Stopping always ends in "off", even if the browser never says it has finished.
  function stop() {
    if (asking) cancelled = true;
    clear();
    if (rec) { try { rec.stop(); } catch (_) {} const r = rec; setTimeout(() => { if (rec === r) reset(); }, 700); } else set(false);
  }
  return { start, stop, get listening() { return on; } };
}
