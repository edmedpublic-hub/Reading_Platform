// static/reading/speech-recognition/components/recognizer.js
// PURPOSE: Stable speech recognition wrapper for reading platform

import {
    getSpeechRecognition,
    getRecognitionLanguage
} from '../utils/recognition-utils.js';

let recognition = null;
let isListening = false;
let manualStop = false;
let finalTranscript = '';
let interimTranscript = '';
let restartAttempts = 0;

const MAX_RESTART_ATTEMPTS = 3;
const MAX_TRANSCRIPT_LENGTH = 2000;

let alternativesStore = [];

// Callbacks
let onResultCallback = null;
let onStartCallback = null;
let onEndCallback = null;
let onErrorCallback = null;
let onSpeechStartCallback = null;
let onSpeechEndCallback = null;
let onAudioStartCallback = null;
let onAudioEndCallback = null;
let onSoundStartCallback = null;
let onSoundEndCallback = null;

// Configuration
let config = {
    lang: 'en-US',
    continuous: true,
    interimResults: true,
    maxAlternatives: 3,
    autoRestart: true,
    restartDelay: 1000,
    expectedText: '',
    useGrammar: true
};

let grammarList = [];

/* ---------------------------------------------------
INIT
--------------------------------------------------- */

export function initRecognizer(options = {}) {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        console.error('Speech recognition not supported');
        return false;
    }

    if (options.config) {
        config = { ...config, ...options.config };
    }

    if (options.callbacks) {
        const cb = options.callbacks;
        onResultCallback = cb.onResult;
        onStartCallback = cb.onStart;
        onEndCallback = cb.onEnd;
        onErrorCallback = cb.onError;
        onSpeechStartCallback = cb.onSpeechStart;
        onSpeechEndCallback = cb.onSpeechEnd;
        onAudioStartCallback = cb.onAudioStart;
        onAudioEndCallback = cb.onAudioEnd;
        onSoundStartCallback = cb.onSoundStart;
        onSoundEndCallback = cb.onSoundEnd;
    }

    if (config.useGrammar && config.expectedText) {
        buildGrammar(config.expectedText);
    }

    return true;
}

/* ---------------------------------------------------
CREATE RECOGNITION
--------------------------------------------------- */

function createRecognitionInstance() {
    const SpeechRecognition = getSpeechRecognition();
    const instance = new SpeechRecognition();

    instance.lang = config.lang;
    instance.continuous = config.continuous;
    instance.interimResults = config.interimResults;
    instance.maxAlternatives = config.maxAlternatives;

    const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;

    if (grammarList.length && SpeechGrammarList && instance.grammars) {
        const grammar = new SpeechGrammarList();
        grammarList.forEach(g => grammar.addFromString(g, 1));
        instance.grammars = grammar;
    }

    return instance;
}

/* ---------------------------------------------------
GRAMMAR BUILDER
--------------------------------------------------- */

function buildGrammar(text) {
    if (!text) return;

    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    const uniqueWords = [...new Set(words)];
    const grammar = `#JSGF V1.0; grammar words; public <word> = ${uniqueWords.join(' | ')} ;`;
    grammarList = [grammar];

    console.log(`📚 Grammar built with ${uniqueWords.length} words`);
}

export function setExpectedText(text) {
    config.expectedText = text;
    if (config.useGrammar) {
        buildGrammar(text);
    }
}

/* ---------------------------------------------------
EVENT HANDLERS
--------------------------------------------------- */

function setupEventHandlers() {
    if (!recognition) return;

    recognition.onstart = () => {
        isListening = true;
        manualStop = false;
        restartAttempts = 0;
        console.log('🎤 Recognition started');
        onStartCallback?.();
    };

    recognition.onend = () => {
        isListening = false;
        console.log('🎤 Recognition ended');

        if (manualStop) {
            onEndCallback?.();
            return;
        }

        if (config.autoRestart && restartAttempts < MAX_RESTART_ATTEMPTS) {
            restartAttempts++;
            console.log(`🔄 Restart attempt ${restartAttempts}`);
            setTimeout(() => {
                try {
                    if (!manualStop) recognition.start();
                } catch (e) {
                    console.warn('Restart failed', e);
                }
            }, config.restartDelay);
        }
        onEndCallback?.();
    };

    recognition.onerror = (event) => {
        console.error('Recognition error', event.error);
        if (event.error === 'no-speech' && config.continuous) return;
        onErrorCallback?.(event);
    };

    recognition.onresult = handleResult;
    recognition.onspeechstart = () => onSpeechStartCallback?.();
    recognition.onspeechend = () => onSpeechEndCallback?.();
    recognition.onaudiostart = () => onAudioStartCallback?.();
    recognition.onaudioend = () => onAudioEndCallback?.();
    recognition.onsoundstart = () => onSoundStartCallback?.();
    recognition.onsoundend = () => onSoundEndCallback?.();
}

/* ---------------------------------------------------
RESULT HANDLER
--------------------------------------------------- */

function handleResult(event) {
    let finalChunk = '';
    let interimChunk = '';
    const altCollection = [];

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alts = [];
        for (let j = 0; j < result.length; j++) {
            alts.push({
                transcript: result[j].transcript,
                confidence: result[j].confidence || 0
            });
        }
        altCollection.push(alts);
        const bestTranscript = result[0].transcript;

        if (result.isFinal) {
            finalChunk += bestTranscript + ' ';
            finalTranscript += bestTranscript + ' ';
        } else {
            interimChunk += bestTranscript + ' ';
            interimTranscript = bestTranscript;
        }
    }

    alternativesStore.push(...altCollection);

    if (finalTranscript.length > MAX_TRANSCRIPT_LENGTH) {
        finalTranscript = finalTranscript.slice(-MAX_TRANSCRIPT_LENGTH);
    }

    const fullTranscript = (finalTranscript + ' ' + interimTranscript).trim();

    onResultCallback?.({
        transcript: fullTranscript,
        interim: interimTranscript.trim(),
        final: finalTranscript.trim(),
        isFinal: finalChunk.length > 0,
        alternatives: altCollection,
        timestamp: Date.now()
    });
}

/* ---------------------------------------------------
CONTROL
--------------------------------------------------- */

export function start(continuous = null) {
    // If an instance exists and is listening, don't start a second one
    if (isListening) {
        console.warn("Recognition already active.");
        return;
    }

    // Always ensure we have a fresh instance with correct handlers
    recognition = createRecognitionInstance();
    setupEventHandlers();

    try {
        if (continuous !== null) {
            recognition.continuous = continuous;
        }

        manualStop = false;
        resetTranscript();
        console.log('▶️ Starting recognition');
        recognition.start();
    } catch (error) {
        if (error.name === 'InvalidStateError') {
            recognition.stop();
            setTimeout(() => start(continuous), 100);
        } else {
            console.error('Start failed', error);
            onErrorCallback?.({
                error: 'start-failed',
                message: error.message
            });
        }
    }
}

export function stop() {
    console.log("🛑 Recognizer: Stop requested");
    manualStop = true;

    if (!recognition) {
        console.warn("No recognition instance to stop.");
        return;
    }

    try {
        recognition.stop();
        isListening = false;
        console.log("✅ Recognizer: Stop signal sent");
    } catch (e) {
        console.warn("Stop failed:", e);
    }
}

export function abort() {
    manualStop = true;
    if (!recognition) return;
    try {
        recognition.abort();
        isListening = false;
    } catch {}
}

/* ---------------------------------------------------
TRANSCRIPT & UTILS
--------------------------------------------------- */

export function resetTranscript() {
    finalTranscript = '';
    interimTranscript = '';
    alternativesStore = [];
}
export function getTranscript() {
    return {
        final: finalTranscript.trim(),
        interim: interimTranscript.trim(),
        full: (finalTranscript + ' ' + interimTranscript).trim(),
        alternatives: alternativesStore
    };
}
export function setLanguage(lang) {
    config.lang = lang;

    // If recognition is already running, apply immediately
    if (recognition && isListening) {
        try {
            recognition.lang = lang;
        } catch (e) {
            console.warn('Failed to update language on active recognition', e);
        }
    }
}

export function isCurrentlyListening() {
    return isListening;
}

export default {
    initRecognizer,
    start,
    stop,
    abort,
    resetTranscript,
    isCurrentlyListening
};