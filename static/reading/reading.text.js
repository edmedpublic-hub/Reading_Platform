// project/static/reading/reading.text.js

// DOM elements
const textEl = document.getElementById("lessonText");
const voiceSelect = document.getElementById("voiceSelect");
const readBtn = document.getElementById("readBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const stopBtn = document.getElementById("stopBtn");

// Speech synthesis
export const synth = window.speechSynthesis;
export let voices = [];

// Reading state
let isReading = false;
let isPaused = false;
let currentIndex = 0;
let autoScrollEnabled = true;

// Mobile detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Populate voice dropdown
export function populateVoices() {
    if (!voiceSelect) return;
    
    voices = synth.getVoices().filter(v => v.lang.startsWith("en")) || [];
    const prevValue = voiceSelect.value;
    
    voiceSelect.innerHTML = "";
    
    // Add default option
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "📢 Default Voice";
    voiceSelect.appendChild(defaultOpt);
    
    // Add available voices
    voices.forEach((v, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = isMobile ? v.name.split(' ')[0] : `${v.name} (${v.lang})`;
        voiceSelect.appendChild(opt);
    });
    
    // Restore previous selection
    if (prevValue && voiceSelect.querySelector(`option[value="${prevValue}"]`)) {
        voiceSelect.value = prevValue;
    }
}

// Initialize voices
if (synth) {
    synth.onvoiceschanged = populateVoices;
}

// Render highlighted text
export function renderHighlighted(index) {
    if (!textEl || !window.displayedSentences?.length) return;
    
    const html = window.displayedSentences
        .map((s, i) => {
            const className = i === index ? 'highlight active-sentence' : '';
            return `<span class="${className}" data-sentence="${i}">${s}</span>`;
        })
        .join(" ");
    
    textEl.innerHTML = html;
    
    // Scroll to current sentence
    if (index >= 0 && autoScrollEnabled) {
        const el = textEl.querySelector(`[data-sentence="${index}"]`);
        if (el) {
            el.scrollIntoView({
                behavior: "smooth",
                block: isMobile ? "nearest" : "center"
            });
        }
    }
}

export function getCurrentIndex() {
    return currentIndex;
}

// Speak a sentence
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
    if (!text || text.trim() === '') {
        if (!isPaused && isReading) speakSentence(i + 1);
        return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice
    const selectedVoice = parseInt(voiceSelect?.value, 10);
    if (!isNaN(selectedVoice) && voices[selectedVoice]) {
        utterance.voice = voices[selectedVoice];
    }
    
    utterance.lang = "en-US";
    utterance.rate = isMobile ? 0.9 : 1.0;
    utterance.pitch = 1.0;
    
    utterance.onend = () => {
        if (!isPaused && isReading) {
            setTimeout(() => speakSentence(i + 1), 200);
        }
    };
    
    utterance.onerror = (event) => {
        console.error("Speech error:", event);
        if (!isPaused && isReading) {
            setTimeout(() => speakSentence(i + 1), 500);
        }
    };
    
    // Cancel any ongoing speech
    if (synth.speaking) {
        synth.cancel();
        setTimeout(() => synth.speak(utterance), 100);
    } else {
        synth.speak(utterance);
    }
}

// Initialize buttons
export function initTextReader() {
    if (!readBtn || !pauseBtn || !resumeBtn || !stopBtn) {
        console.warn("TTS buttons not found");
        return;
    }
    
    readBtn.addEventListener("click", () => {
        if (!window.originalSentences?.length) {
            alert("No text available");
            return;
        }
        
        synth.cancel();
        isReading = true;
        isPaused = false;
        currentIndex = 0;
        
        setTimeout(() => speakSentence(0), 100);
    });
    
    pauseBtn.addEventListener("click", () => {
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
    
    resumeBtn.addEventListener("click", () => {
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
    
    stopBtn.addEventListener("click", () => {
        synth.cancel();
        isReading = false;
        isPaused = false;
        currentIndex = 0;
        
        window.displayedSentences = window.originalSentences?.slice() || [];
        renderHighlighted(-1);
    });
    
    console.log("Text reader initialized");
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    .highlight {
        background-color: #fff3cd;
        transition: background-color 0.3s ease;
        padding: 2px 4px;
        border-radius: 4px;
    }
    .active-sentence {
        border-left: 4px solid #ffc107;
        padding-left: 8px;
    }
    @media (max-width: 768px) {
        .highlight {
            padding: 4px 6px;
        }
    }
`;
document.head.appendChild(style);