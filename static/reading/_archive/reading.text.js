// static/reading/reading.text.js
// PURPOSE: Text-to-speech engine with Arabic/RTL support and progress tracking
// DEPENDENCIES: None

let state = {
    initialized: false, synth: null, voices: [], currentUtterance: null,
    currentSentenceIndex: -1, isReading: false, isPaused: false,
    autoScrollEnabled: true, queue: [],
    elementIds: { 
        textContainer: 'lessonText', 
        voiceSelect: 'voiceSelect',
        readBtn: 'readBtn', 
        pauseBtn: 'pauseBtn', 
        resumeBtn: 'resumeBtn', 
        stopBtn: 'stopBtn' 
    },
    callbacks: { 
        onStart: null, onPause: null, onResume: null, onStop: null,
        onSentenceChange: null, onComplete: null, onError: null 
    },
    config: { 
        rate: 1.0, 
        pitch: 1.0, 
        volume: 1.0, 
        lang: 'en-US', 
        sentenceDelay: 200, 
        mobileRate: 0.9,
        rtlSupport: true
    }
};
let elements = {};

export function initTextReader(options = {}) {
    if (state.initialized) return getPublicAPI();
    mergeOptions(options);
    if (!checkSpeechSupport()) { handleNoSupport(); return getPublicAPI(); }
    if (!getElements()) return getPublicAPI();
    loadVoices(); setupVoiceChangeListener(); setupButtonListeners(); addStyles();
    state.initialized = true;
    return getPublicAPI();
}

function mergeOptions(options) {
    if (options.elementIds) state.elementIds = { ...state.elementIds, ...options.elementIds };
    if (options.callbacks) state.callbacks = { ...state.callbacks, ...options.callbacks };
    if (options.config) state.config = { ...state.config, ...options.config };
    if (isMobile()) state.config.rate = state.config.mobileRate;
}

function checkSpeechSupport() {
    if (!window.speechSynthesis) { console.error('Speech synthesis not supported'); return false; }
    state.synth = window.speechSynthesis; return true;
}

function handleNoSupport() {
    ['readBtn', 'pauseBtn', 'resumeBtn', 'stopBtn'].forEach(btnId => {
        const btn = document.getElementById(state.elementIds[btnId]);
        if (btn) { btn.disabled = true; btn.title = 'Text-to-speech not supported'; }
    });
    const voiceSelect = document.getElementById(state.elementIds.voiceSelect);
    if (voiceSelect) { voiceSelect.disabled = true; voiceSelect.title = 'Text-to-speech not supported'; }
}

function getElements() {
    elements = {
        textContainer: document.getElementById(state.elementIds.textContainer),
        voiceSelect: document.getElementById(state.elementIds.voiceSelect),
        readBtn: document.getElementById(state.elementIds.readBtn),
        pauseBtn: document.getElementById(state.elementIds.pauseBtn),
        resumeBtn: document.getElementById(state.elementIds.resumeBtn),
        stopBtn: document.getElementById(state.elementIds.stopBtn)
    };
    return !!elements.textContainer;
}

function loadVoices() {
    if (!state.synth) return;
    
    state.voices = state.synth.getVoices();
    
    // Sort voices: English first, then Arabic, then others
    state.voices.sort((a, b) => {
        const aLang = a.lang.split('-')[0];
        const bLang = b.lang.split('-')[0];
        
        if (aLang === 'en' && bLang !== 'en') return -1;
        if (aLang !== 'en' && bLang === 'en') return 1;
        if (aLang === 'ar' && bLang !== 'ar' && bLang !== 'en') return -1;
        if (aLang !== 'ar' && bLang === 'ar') return 1;
        return 0;
    });
    
    populateVoiceSelect();
    
    if (state.voices.length === 0) setTimeout(loadVoices, 100);
}

function setupVoiceChangeListener() {
    if (!state.synth) return;
    state.synth.onvoiceschanged = () => {
        state.voices = state.synth.getVoices();
        populateVoiceSelect();
    };
}

function populateVoiceSelect() {
    if (!elements.voiceSelect) return;
    
    const previousValue = elements.voiceSelect.value;
    elements.voiceSelect.innerHTML = '';
    
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '📢 Default Voice';
    elements.voiceSelect.appendChild(defaultOpt);
    
    // Group voices by language
    const voicesByLang = {};
    state.voices.forEach((voice, index) => {
        const lang = voice.lang.split('-')[0];
        if (!voicesByLang[lang]) voicesByLang[lang] = [];
        voicesByLang[lang].push({ voice, index });
    });
    
    // Add English voices first
    if (voicesByLang['en']) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = '🇬🇧 English Voices';
        voicesByLang['en'].forEach(({ voice, index }) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = isMobile() ? voice.name.split(' ')[0] : `${voice.name} (${voice.lang})`;
            optgroup.appendChild(opt);
        });
        elements.voiceSelect.appendChild(optgroup);
    }
    
    // Add Arabic voices
    if (voicesByLang['ar']) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = '🇸🇦 Arabic Voices';
        voicesByLang['ar'].forEach(({ voice, index }) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = isMobile() ? voice.name.split(' ')[0] : `${voice.name} (${voice.lang})`;
            optgroup.appendChild(opt);
        });
        elements.voiceSelect.appendChild(optgroup);
    }
    
    // Add other languages
    Object.keys(voicesByLang).forEach(lang => {
        if (lang !== 'en' && lang !== 'ar') {
            const optgroup = document.createElement('optgroup');
            optgroup.label = `🌐 ${lang.toUpperCase()} Voices`;
            voicesByLang[lang].forEach(({ voice, index }) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = isMobile() ? voice.name.split(' ')[0] : `${voice.name} (${voice.lang})`;
                optgroup.appendChild(opt);
            });
            elements.voiceSelect.appendChild(optgroup);
        }
    });
    
    if (previousValue && elements.voiceSelect.querySelector(`option[value="${previousValue}"]`)) {
        elements.voiceSelect.value = previousValue;
    }
}

function setupButtonListeners() {
    if (elements.readBtn) elements.readBtn.addEventListener('click', () => startReading());
    if (elements.pauseBtn) elements.pauseBtn.addEventListener('click', pauseReading);
    if (elements.resumeBtn) elements.resumeBtn.addEventListener('click', resumeReading);
    if (elements.stopBtn) elements.stopBtn.addEventListener('click', stopReading);
}

function getSentences() {
    if (!elements.textContainer) return [];
    
    const sentenceElements = elements.textContainer.querySelectorAll('.reading-sentence');
    
    if (sentenceElements.length > 0) {
        return Array.from(sentenceElements).map((el, index) => ({ 
            text: el.textContent, 
            element: el, 
            index 
        }));
    }
    
    const text = elements.textContainer.textContent;
    const sentences = extractSentences(text);
    
    // Detect if text contains Arabic for RTL support
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    
    elements.textContainer.innerHTML = sentences.map((s, i) => 
        `<p class="reading-sentence" data-sentence="${i}" ${hasArabic ? 'dir="auto"' : ''}>${s}</p>`
    ).join('');
    
    if (hasArabic && state.config.rtlSupport) {
        elements.textContainer.setAttribute('dir', 'auto');
    }
    
    return Array.from(elements.textContainer.querySelectorAll('.reading-sentence'))
        .map((el, i) => ({ text: el.textContent, element: el, index: i }));
}

function extractSentences(text) {
    if (!text) return [];
    
    // For Arabic, use different sentence boundary detection
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    
    if (hasArabic) {
        // Arabic sentences often end with ؟ or .
        return text.replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .split(/(?<=[.!?؟])\s+/)
            .filter(s => s.trim().length > 0);
    } else {
        return text.replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .split(/(?<=[.!?])\s+/)
            .filter(s => s.trim().length > 0);
    }
}

export function startReading(startIndex = 0) {
    if (!state.synth) return;
    
    const sentences = getSentences();
    
    if (sentences.length === 0) { 
        triggerCallback('onError', { error: 'No text to read' }); 
        return; 
    }
    
    stopReading(false);
    
    state.isReading = true; 
    state.isPaused = false;
    state.currentSentenceIndex = startIndex;
    state.queue = sentences.slice(startIndex);
    
    updateButtonStates();
    readNextSentence();
    triggerCallback('onStart', { totalSentences: sentences.length });
}

function readNextSentence() {
    if (!state.isReading || state.isPaused || state.queue.length === 0) {
        if (state.queue.length === 0) completeReading();
        return;
    }
    
    const sentence = state.queue[0];
    highlightSentence(sentence.index);
    
    const utterance = createUtterance(sentence.text);
    
    utterance.onstart = () => triggerCallback('onSentenceChange', { 
        index: sentence.index, 
        text: sentence.text 
    });
    
    utterance.onend = () => {
        state.queue.shift();
        setTimeout(() => readNextSentence(), state.config.sentenceDelay);
    };
    
    utterance.onerror = (event) => {
        console.error('Speech error:', event);
        state.queue.shift();
        setTimeout(() => readNextSentence(), state.config.sentenceDelay);
        triggerCallback('onError', { error: event.error, sentence: sentence.text });
    };
    
    state.currentUtterance = utterance;
    state.synth.speak(utterance);
}

function createUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Detect language for appropriate voice selection
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    
    if (hasArabic) {
        utterance.lang = 'ar-SA';
        
        // Try to find an Arabic voice
        if (elements.voiceSelect && elements.voiceSelect.value === '') {
            // Find first Arabic voice
            const arabicVoice = state.voices.find(v => v.lang.startsWith('ar'));
            if (arabicVoice) {
                const voiceIndex = state.voices.indexOf(arabicVoice);
                utterance.voice = arabicVoice;
                elements.voiceSelect.value = voiceIndex;
            }
        }
    } else {
        utterance.lang = state.config.lang;
    }
    
    if (elements.voiceSelect && elements.voiceSelect.value !== '') {
        const selectedIndex = parseInt(elements.voiceSelect.value, 10);
        if (!isNaN(selectedIndex) && state.voices[selectedIndex]) {
            utterance.voice = state.voices[selectedIndex];
        }
    }
    
    utterance.rate = state.config.rate;
    utterance.pitch = state.config.pitch;
    utterance.volume = state.config.volume;
    
    return utterance;
}

/* ===== NEW FUNCTION ADDED: Calculate TTS progress ===== */
function updateTTSProgress() {
    if (!elements.textContainer) return 0;
    
    const sentences = elements.textContainer.querySelectorAll('.reading-sentence');
    if (sentences.length === 0) return 0;
    
    // Calculate progress based on current sentence
    const progress = ((state.currentSentenceIndex + 1) / sentences.length) * 100;
    return Math.min(100, Math.max(0, progress));
}
/* ===== END NEW FUNCTION ===== */

/* ===== MODIFIED FUNCTION: Added progress event dispatch ===== */
function highlightSentence(index) {
    if (!elements.textContainer) return;
    
    elements.textContainer.querySelectorAll('.reading-sentence').forEach(el => {
        el.classList.remove('active-sentence', 'highlight');
    });
    
    const currentEl = elements.textContainer.querySelector(`[data-sentence="${index}"]`);
    if (currentEl) {
        currentEl.classList.add('active-sentence', 'highlight');
        
        if (state.autoScrollEnabled) {
            currentEl.scrollIntoView({ 
                behavior: 'smooth', 
                block: isMobile() ? 'nearest' : 'center' 
            });
        }
    }
    
    window.__currentReadingSentence = index;
    
    // ===== NEW LINES ADDED: Dispatch progress event =====
    const progress = updateTTSProgress();
    document.dispatchEvent(new CustomEvent('tts-progress', {
        detail: { progress, sentenceIndex: index }
    }));
    // ===== END NEW LINES =====
}
/* ===== END MODIFIED FUNCTION ===== */

export function pauseReading() {
    if (!state.synth || !state.isReading || state.isPaused) return;
    try { 
        state.synth.pause(); 
        state.isPaused = true; 
        updateButtonStates(); 
        triggerCallback('onPause', {}); 
    } catch (error) { 
        console.error('Pause failed:', error); 
    }
}

export function resumeReading() {
    if (!state.synth || !state.isReading || !state.isPaused) return;
    try { 
        state.synth.resume(); 
        state.isPaused = false; 
        updateButtonStates(); 
        triggerCallback('onResume', {}); 
    } catch (error) {
        console.error('Resume failed:', error);
        stopReading(false);
        startReading(state.currentSentenceIndex);
    }
}

/* ===== MODIFIED FUNCTION: Added progress reset ===== */
export function stopReading(triggerCallbacks = true) {
    // ===== NEW LINE ADDED: Reset progress on stop =====
    document.dispatchEvent(new CustomEvent('tts-progress', { detail: { progress: 0 } }));
    
    if (!state.synth) return;
    try { 
        state.synth.cancel(); 
    } catch (error) { 
        console.error('Stop failed:', error); 
    }
    
    state.isReading = false; 
    state.isPaused = false;
    state.currentUtterance = null; 
    state.queue = [];
    
    if (elements.textContainer) {
        elements.textContainer.querySelectorAll('.reading-sentence').forEach(el => {
            el.classList.remove('active-sentence', 'highlight');
        });
    }
    
    updateButtonStates();
    if (triggerCallbacks) triggerCallback('onStop', {});
    window.__currentReadingSentence = -1;
}
/* ===== END MODIFIED FUNCTION ===== */

/* ===== MODIFIED FUNCTION: Added completion at 100% ===== */
function completeReading() {
    // ===== NEW LINE ADDED: Set progress to 100% when complete =====
    document.dispatchEvent(new CustomEvent('tts-progress', { detail: { progress: 100 } }));
    
    state.isReading = false; 
    state.isPaused = false;
    state.currentUtterance = null;
    updateButtonStates();
    triggerCallback('onComplete', {});
    window.__currentReadingSentence = -1;
}
/* ===== END MODIFIED FUNCTION ===== */

function updateButtonStates() {
    const { readBtn, pauseBtn, resumeBtn, stopBtn } = elements;
    if (readBtn) { 
        readBtn.disabled = state.isReading; 
        readBtn.setAttribute('aria-pressed', state.isReading ? 'false' : 'true'); 
    }
    if (pauseBtn) { 
        pauseBtn.disabled = !state.isReading || state.isPaused; 
        pauseBtn.setAttribute('aria-pressed', state.isPaused ? 'false' : 'true'); 
    }
    if (resumeBtn) { 
        resumeBtn.disabled = !state.isReading || !state.isPaused; 
        resumeBtn.setAttribute('aria-pressed', state.isPaused ? 'true' : 'false'); 
    }
    if (stopBtn) { 
        stopBtn.disabled = !state.isReading; 
        stopBtn.setAttribute('aria-pressed', state.isReading ? 'true' : 'false'); 
    }
}

function triggerCallback(name, data) {
    if (state.callbacks[name] && typeof state.callbacks[name] === 'function') {
        try { state.callbacks[name](data); } catch (error) { console.error(`Callback ${name} failed:`, error); }
    }
    document.dispatchEvent(new CustomEvent(`text-reader-${name.replace('on', '').toLowerCase()}`, {
        detail: { ...data, timestamp: Date.now() }
    }));
}

export function getVoices() {
    return state.voices.map((voice, index) => ({ 
        index, 
        name: voice.name, 
        lang: voice.lang, 
        default: voice.default 
    }));
}

export function setVoice(index) {
    if (elements.voiceSelect && index >= 0 && index < state.voices.length) {
        elements.voiceSelect.value = index;
    }
}

export function setRate(rate) { state.config.rate = Math.max(0.5, Math.min(2, rate)); }
export function setAutoScroll(enabled) { state.autoScrollEnabled = enabled; }
export function isReading() { return state.isReading; }
export function isPaused() { return state.isPaused; }
export function getCurrentSentence() { return state.currentSentenceIndex; }

function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function addStyles() {
    if (document.getElementById('reading-text-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'reading-text-styles';
    style.textContent = `
        .reading-sentence { 
            margin-bottom: 1rem; 
            line-height: 1.8; 
            transition: all 0.3s ease; 
        }
        .reading-sentence.highlight { 
            background-color: rgba(255, 193, 7, 0.1); 
            border-radius: 4px; 
        }
        .reading-sentence.active-sentence { 
            border-left: 4px solid #ffc107; 
            padding-left: 1rem; 
            background-color: rgba(255, 193, 7, 0.2); 
        }
        /* RTL Support */
        [dir="rtl"] .reading-sentence.active-sentence {
            border-left: none;
            border-right: 4px solid #ffc107;
            padding-left: 0;
            padding-right: 1rem;
        }
        @media (max-width: 768px) {
            .reading-sentence { 
                line-height: 1.6; 
                font-size: 1.1rem; 
            }
            .reading-sentence.active-sentence { 
                padding-left: 0.75rem; 
            }
            [dir="rtl"] .reading-sentence.active-sentence {
                padding-left: 0;
                padding-right: 0.75rem;
            }
        }
    `;
    document.head.appendChild(style);
}

function getPublicAPI() {
    return {
        init: initTextReader, speak: startReading, pause: pauseReading,
        resume: resumeReading, stop: stopReading, getVoices, setVoice,
        setRate, setAutoScroll, isReading, isPaused, getCurrentSentence
    };
}

export default getPublicAPI();