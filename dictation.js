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
// onState(listening): true while the microphone is on. onError(message): plain words for the player.
// onNote(message): a short status ("Asking for the microphone...") shown while the browser's question is on screen.
export function createDictation({ onText, onState, onError, onNote }) {
  let rec = null, finals = "", on = false, asking = false, cancelled = false;
  const set = (v) => { on = v; if (onState) onState(v); };
  // Once the browser has said yes, later taps start straight away (Safari wants listening to start right after the tap). The first tap asks first.
  async function start() {
    if (on || asking) return;
    cancelled = false;
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
      if (res.reason !== "unsupported") microphoneKnown = "granted";
    }
    begin();
  }
  function begin() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) { if (onError) onError("This browser cannot listen. Type your note, or use the microphone key on your keyboard."); return; }
    finals = "";
    try {
      rec = new Ctor();
      rec.lang = (navigator.language || "en-US");
      rec.continuous = true; rec.interimResults = true;
      rec.onresult = (ev) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i], t = r[0] ? r[0].transcript : "";
          if (r.isFinal) finals += (finals ? " " : "") + t.trim(); else interim += t;
        }
        if (onText) onText(finals, interim.trim());
      };
      rec.onerror = (ev) => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") microphoneKnown = null; if (ev.error !== "no-speech" && ev.error !== "aborted" && onError) onError(WORDS[ev.error] || "Could not listen (" + ev.error + "). You can type your note instead."); };
      rec.onend = () => { set(false); rec = null; };
      rec.start(); set(true);
    } catch (e) { set(false); rec = null; if (onError) onError("Could not start the microphone. You can type your note instead."); }
  }
  function stop() { if (asking) cancelled = true; if (rec) { try { rec.stop(); } catch (_) {} } }
  return { start, stop, get listening() { return on; } };
}
