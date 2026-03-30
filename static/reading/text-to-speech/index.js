// static/reading/text-to-speech/index.js
// PURPOSE: Master controller for Text-To-Speech system

import * as engine from './engine.js';
import {
    initSentenceReader,
    loadSentences,
    startQueue,
    getNextSentence,
    advanceQueue,
    isQueueEmpty,
    resetQueue,
    getCurrentIndex,
    setQueue as setReaderQueue
} from './components/sentence-reader.js';

import {
    initVoiceSelector,
    initVoiceSelector as initVoiceSelectorComponent, 
    getSelectedVoice
} from './components/voice-selector.js';

let state = {
    initialized: false,
    speaking: false,
    paused: false,
    container: null
};

let elements = {
    textContainer: null,
    readBtn: null,
    pauseBtn: null,
    resumeBtn: null,
    stopBtn: null,
    voiceSelect: null
};

// Split text into segments based on Arabic content
function splitTextByLanguage(text) {
    // First, extract Arabic text including surrounding curly braces
    const arabicWithBracesPattern = /{[^{}]*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+[^{}]*}/g;
    
    const segments = [];
    let lastIndex = 0;
    let match;
    
    while ((match = arabicWithBracesPattern.exec(text)) !== null) {
        // Add English text before Arabic block
        if (match.index > lastIndex) {
            const englishText = text.substring(lastIndex, match.index).trim();
            if (englishText) {
                segments.push({
                    text: englishText,
                    isArabic: false
                });
            }
        }
        
        // Add Arabic block (including curly braces)
        segments.push({
            text: match[0],
            isArabic: true
        });
        
        lastIndex = match.index + match[0].length;
    }
    
    // Add remaining English text after last Arabic
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex).trim();
        if (remainingText) {
            segments.push({
                text: remainingText,
                isArabic: false
            });
        }
    }
    
    // If no Arabic found, return whole text as English
    if (segments.length === 0) {
        segments.push({
            text: text,
            isArabic: false
        });
    }
    
    return segments;
}

/* ------------------------------------------------
   INITIALIZE TTS SYSTEM
------------------------------------------------ */

export function init(options = {}) {
    if (state.initialized) return;

    elements.textContainer = document.getElementById(options.text);
    elements.readBtn = document.getElementById(options.readBtn);
    elements.pauseBtn = document.getElementById(options.pauseBtn);
    elements.resumeBtn = document.getElementById(options.resumeBtn);
    elements.stopBtn = document.getElementById(options.stopBtn);
    elements.voiceSelect = document.getElementById(options.voiceSelect);

    if (!elements.textContainer) {
        console.error(`TTS: text container not found. ID: "${options.text}"`);
        return;
    }

    engine.initEngine();

    initSentenceReader(elements.textContainer, onSentenceChange, {
        autoScroll: true
    });

    if (elements.voiceSelect) {
        const initFn = typeof initVoiceSelector === 'function' ? initVoiceSelector : initVoiceSelectorComponent;
        initFn(elements.voiceSelect);
    }

    attachEvents();
    
    // Enable control buttons
    if (elements.pauseBtn) {
        elements.pauseBtn.onclick = () => pauseText();
        elements.pauseBtn.disabled = false;
    }
    if (elements.resumeBtn) {
        elements.resumeBtn.onclick = () => resumeText();
        elements.resumeBtn.disabled = false;
    }
    if (elements.stopBtn) {
        elements.stopBtn.onclick = () => stopText();
        elements.stopBtn.disabled = false;
    }
    if (elements.readBtn) {
        elements.readBtn.disabled = false;
    }
    
    state.initialized = true;
    console.log("TTS system initialized");

    return {
        setText,
        setQueue,
        playText,
        pauseText,
        resumeText,
        stopText,
        isSpeaking,
        isPaused
    };
}

/* ------------------------------------------------
   QUEUE MANAGEMENT
------------------------------------------------ */

export function setQueue(elementsArray) {
    if (typeof setReaderQueue === 'function') {
        setReaderQueue(elementsArray);
    }
}

export function setText(text) {
    if (!text) return;
    loadSentences(text);
}

/* ------------------------------------------------
   PLAYBACK LOGIC
------------------------------------------------ */

function attachEvents() {
    if (elements.readBtn) elements.readBtn.addEventListener("click", playText);
    if (elements.pauseBtn) elements.pauseBtn.addEventListener("click", pauseText);
    if (elements.resumeBtn) elements.resumeBtn.addEventListener("click", resumeText);
    if (elements.stopBtn) elements.stopBtn.addEventListener("click", stopText);
}

export function playText() {
    if (state.speaking && !state.paused) return;
    
    if (state.paused) {
        resumeText();
        return;
    }

    // Cancel any pending speech
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    
    // Enable control buttons
    if (elements.pauseBtn) elements.pauseBtn.disabled = false;
    if (elements.resumeBtn) elements.resumeBtn.disabled = false;
    if (elements.stopBtn) elements.stopBtn.disabled = false;
    
    // Reset engine state
    if (engine.isSpeakingNow()) {
        engine.stop();
    }
    
    startQueue(0);
    state.speaking = true;
    state.paused = false;

    setTimeout(() => {
        speakNextSentence();
    }, 50);
}

/* ------------------------------------------------
   SPEAK SENTENCES
----------------------------------------- */

async function speakNextSentence() {
    const sentence = getNextSentence();
    
    if (!sentence || !sentence.element) {
        stopText();
        return;
    }

    const textToRead = sentence.element.textContent || "";
    
    if (textToRead.trim().length === 0) {
        advanceQueue();
        speakNextSentence();
        return;
    }

    // Split text into language segments
    const segments = splitTextByLanguage(textToRead);
    
    // Function to read segments sequentially
    let segmentIndex = 0;
    let isPausedFlag = false;
    
    function readNextSegment() {
        if (isPausedFlag) return;
        
        if (segmentIndex >= segments.length) {
            // All segments done, move to next sentence
            if (!state.paused && !isQueueEmpty()) {
                advanceQueue();
                speakNextSentence();
            } else if (isQueueEmpty()) {
                stopText();
            }
            return;
        }
        
        const segment = segments[segmentIndex];
        segmentIndex++;
        
        createAndSpeakSegment(segment, () => {
            if (!state.paused) {
                setTimeout(readNextSegment, 50);
            }
        });
    }
    
    function createAndSpeakSegment(segment, onComplete) {
    try {
        let textToSpeak = segment.text;
        if (segment.isArabic) {
            textToSpeak = textToSpeak.replace(/[{}]/g, '');
        }
        
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        
        // Use the voice selector module to get the selected voice
        const selectedVoice = getSelectedVoice();
        
        if (segment.isArabic) {
            utterance.lang = 'ar-SA';
            // If a voice is selected, use it; otherwise find Arabic voice
            if (selectedVoice && selectedVoice.lang.startsWith('ar')) {
                utterance.voice = selectedVoice;
            } else {
                const voices = window.speechSynthesis.getVoices();
                const arabicVoice = voices.find(v => v.lang.startsWith('ar'));
                if (arabicVoice) {
                    utterance.voice = arabicVoice;
                }
            }
        } else {
            utterance.lang = 'en-US';
            // If a voice is selected, use it; otherwise find English voice
            if (selectedVoice && (selectedVoice.lang.startsWith('en') || !selectedVoice.lang.startsWith('ar'))) {
                utterance.voice = selectedVoice;
            } else {
                const voices = window.speechSynthesis.getVoices();
                const englishVoice = voices.find(v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Microsoft'))) 
                    || voices.find(v => v.lang.startsWith('en'));
                if (englishVoice) {
                    utterance.voice = englishVoice;
                }
            }
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        let completed = false;
        
        utterance.onend = () => {
            if (completed) return;
            completed = true;
            if (!state.paused) {
                onComplete();
            }
        };
        
        utterance.onerror = (e) => {
            if (completed) return;
            completed = true;
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                console.warn("Segment error:", e.error);
            }
            if (!state.paused) {
                onComplete();
            }
        };
        
        engine.speak(utterance);
        
    } catch (error) {
        console.error("Error creating segment:", error);
        onComplete();
    }
}
    
    // Start reading segments
    readNextSegment();
}

/* ------------------------------------------------
   CONTROLS
------------------------------------------------ */

export function pauseText() {
    if (!engine.isSpeakingNow()) return;
    
    engine.pause();
    state.paused = true;
}

export function resumeText() {
    if (state.paused && engine.isPausedNow()) {
        engine.resume();
        state.paused = false;
    } else if (state.paused && !engine.isPausedNow()) {
        // If we're in paused state but engine isn't paused, restart the current sentence
        state.paused = false;
        speakNextSentence();
    }
}

export function stopText() {
    // Prevent multiple calls
    if (!state.speaking && !state.paused) return;
    
    engine.stop();
    resetQueue();
    state.speaking = false;
    state.paused = false;
}

function onSentenceChange(sentence) {
    document.dispatchEvent(new CustomEvent("tts-progress", {
        detail: {
            sentenceIndex: sentence.index,
            text: sentence.text
        }
    }));
}

/* ------------------------------------------------
   EXPORTS
------------------------------------------------ */

export const isSpeaking = () => state.speaking;
export const isPaused = () => state.paused;

export default {
    init,
    setText,
    setQueue,
    playText,
    pauseText,
    resumeText,
    stopText,
    isSpeaking,
    isPaused
};