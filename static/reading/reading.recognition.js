// project/static/reading/reading.recognition.js

export const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export let recognition = null;

// Shared transcript accumulator
window.transcriptAcc = window.transcriptAcc || "";

export function initRecognition() {
  if (!SpeechRecognition) {
    alert("Speech Recognition is not supported in this browser.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = true;

  recognition.onresult = (e) => {
    const transcript = e.results[e.results.length - 1][0].transcript;
    window.transcriptAcc = (window.transcriptAcc || "") + " " + transcript;
    console.debug("Recognition result:", transcript);
  };

  recognition.onerror = (e) => {
    console.error("Recognition error:", e);
  };

  recognition.onend = () => {
    console.debug("Recognition ended");
  };
}
