// Speaking notes: the browser's own speech recognition (Chrome, Edge, Safari). Where it is missing, the notes box still works by typing, or with the microphone key on the phone's keyboard.
// Talks to the browser only; the text rules are in notes.js. The browser may send the audio to its maker's speech service (the terms and privacy policy say so).
export const dictationSupported = () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const WORDS = {
  "not-allowed": "The microphone is blocked for this page. Allow it in the browser's settings, or type your note.",
  "service-not-allowed": "The microphone is blocked for this page. Allow it in the browser's settings, or type your note.",
  "audio-capture": "No microphone was found. You can type your note instead.",
  "network": "Listening needs an internet connection. You can type your note instead.",
};
// onText(finalText, interimText): everything heard so far in this session (final) and what is still being heard (interim).
// onState(listening): true while the microphone is on. onError(message): plain words for the player.
export function createDictation({ onText, onState, onError }) {
  let rec = null, finals = "", on = false;
  const set = (v) => { on = v; if (onState) onState(v); };
  function start() {
    if (on) return;
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
      rec.onerror = (ev) => { if (ev.error !== "no-speech" && ev.error !== "aborted" && onError) onError(WORDS[ev.error] || "Could not listen (" + ev.error + "). You can type your note instead."); };
      rec.onend = () => { set(false); rec = null; };
      rec.start(); set(true);
    } catch (e) { set(false); rec = null; if (onError) onError("Could not start the microphone. You can type your note instead."); }
  }
  function stop() { if (rec) { try { rec.stop(); } catch (_) {} } }
  return { start, stop, get listening() { return on; } };
}
