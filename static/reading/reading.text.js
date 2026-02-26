// ---------------- TEXT READING MODULE ----------------

// DOM elements (safe-lookup for module load timing)
const textEl = document.getElementById("lessonText");
const voiceSelect = document.getElementById("voiceSelect");

const readBtn = document.getElementById("readBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const stopBtn = document.getElementById("stopBtn");

// Speech synthesis
export const synth = window.speechSynthesis;
export let voices = [];

// Local reading state
let isReading = false;
let isPaused = false;
let currentIndex = 0;

// ---------------- VOICES ----------------
export function populateVoices() {
  if (!voiceSelect) return;

  voices = synth.getVoices().filter(v => v.lang.startsWith("en")) || [];
  const prev = voiceSelect.value;
  voiceSelect.innerHTML = "";

  voices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });

  if (prev && voiceSelect.querySelector(`option[value="${prev}"]`)) {
    voiceSelect.value = prev;
  }
}

synth.onvoiceschanged = populateVoices;

// ---------------- HIGHLIGHT ----------------
export function renderHighlighted(index) {
  if (!textEl) return;

  if (!window.displayedSentences?.length) {
    textEl.innerHTML = "";
    return;
  }

  const html = window.displayedSentences
    .map((s, i) =>
      i === index
        ? `<span class="highlight" data-sentence="${i}">${s}</span>`
        : `<span data-sentence="${i}">${s}</span>`
    )
    .join(" ");

  textEl.innerHTML = html;

  // Ensure current sentence stays in view
  if (index >= 0) {
    const el = textEl.querySelector(`[data-sentence="${index}"]`);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }
}

// Getter used by feedback.js
export function getCurrentIndex() {
  return currentIndex;
}

// ---------------- SPEAK SENTENCE ----------------
function speakSentence(i) {
  if (!window.originalSentences || i >= window.originalSentences.length) {
    isReading = false;
    currentIndex = 0;
    renderHighlighted(-1);
    return;
  }

  currentIndex = i;
  renderHighlighted(i);

  const text = window.originalSentences[i];
  const u = new SpeechSynthesisUtterance(text);

  const sel = parseInt(voiceSelect?.value, 10) || 0;
  if (voices[sel]) u.voice = voices[sel];

  u.lang = "en-GB";
  u.rate = 1;
  u.pitch = 1;

  u.onend = () => {
    if (!isPaused && isReading) speakSentence(i + 1);
  };

  u.onerror = () => {
    if (!isPaused && isReading) speakSentence(i + 1);
  };

  synth.speak(u);
}

// ---------------- INIT TTS BUTTONS ----------------
export function initTextReader() {
  readBtn?.addEventListener("click", () => {
    if (!window.originalSentences?.length) {
      alert("No lesson text available to read.");
      return;
    }

    synth.cancel();
    window.displayedSentences = window.originalSentences.slice();
    isReading = true;
    isPaused = false;
    currentIndex = 0;

    setTimeout(() => speakSentence(0), 100);
  });

  pauseBtn?.addEventListener("click", () => {
    if (synth.speaking && !synth.paused) {
      try {
        synth.pause();
        isPaused = true;
      } catch {
        synth.cancel();
        isPaused = true;
      }
    }
  });

  resumeBtn?.addEventListener("click", () => {
    if (isPaused) {
      try {
        synth.resume();
        isPaused = false;
      } catch {
        isPaused = false;
        synth.cancel();
        setTimeout(() => speakSentence(currentIndex), 100);
      }
    }
  });

  stopBtn?.addEventListener("click", () => {
    synth.cancel();
    isReading = false;
    isPaused = false;
    currentIndex = 0;

    window.displayedSentences = window.originalSentences?.slice() || [];
    renderHighlighted(-1);
  });
}
