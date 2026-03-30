// static/reading/speech-recognition/components/silence-detector.js
// PURPOSE: Detect silence by monitoring microphone audio levels

let silenceTimer = null;

let timeout = 3000;
let minSpeechDuration = 500;

let onSilenceCallback = null;
let onSpeechStartCallback = null;
let onSpeechEndCallback = null;

// State
let isSpeaking = false;
let hasValidSpeech = false;

let speechStartTime = 0;
let silenceStartTime = 0;

// Audio monitoring
let lastAudioLevel = 0;
let audioThreshold = 10;

let consecutiveSilence = 0;
const REQUIRED_SILENCE_SAMPLES = 3;

/* ------------------------------------------------ */
/* INIT */
/* ------------------------------------------------ */

export function initSilenceDetector(options = {}) {

    timeout = options.silenceTimeout ?? timeout;
    minSpeechDuration = options.minSpeechDuration ?? minSpeechDuration;
    audioThreshold = options.audioThreshold ?? audioThreshold;

    onSilenceCallback = options.onSilence || null;
    onSpeechStartCallback = options.onSpeechStart || null;
    onSpeechEndCallback = options.onSpeechEnd || null;

    console.log('🔇 Silence detector ready', {
        timeout,
        minSpeechDuration,
        audioThreshold
    });

}

/* ------------------------------------------------ */
/* AUDIO PROCESSING */
/* ------------------------------------------------ */

export function processAudioLevel(levelData) {

    if (!levelData) return;

    const level = levelData.level || 0;

    lastAudioLevel = level;

    const speakingNow = level > audioThreshold;

    if (speakingNow) {

        consecutiveSilence = 0;

        if (!isSpeaking) {

            handleSpeechStart();

        } else {

            resetSilenceTimer();

        }

    } else {

        consecutiveSilence++;

        if (isSpeaking && consecutiveSilence >= REQUIRED_SILENCE_SAMPLES) {

            handleSpeechEnd();

        }

    }

}

/* ------------------------------------------------ */
/* SPEECH START */
/* ------------------------------------------------ */

function handleSpeechStart() {

    if (isSpeaking) return;

    isSpeaking = true;

    speechStartTime = Date.now();
    hasValidSpeech = false;

    clearSilenceTimer();

    if (onSpeechStartCallback) {
        onSpeechStartCallback();
    }

    document.dispatchEvent(new CustomEvent('speech-started', {
        detail: { timestamp: speechStartTime }
    }));

}

/* ------------------------------------------------ */
/* SPEECH END */
/* ------------------------------------------------ */

function handleSpeechEnd() {

    if (!isSpeaking) return;

    const duration = Date.now() - speechStartTime;

    isSpeaking = false;

    if (duration >= minSpeechDuration) {

        hasValidSpeech = true;

        startSilenceTimer();

        if (onSpeechEndCallback) {
            onSpeechEndCallback(duration);
        }

        document.dispatchEvent(new CustomEvent('speech-ended', {
            detail: {
                duration,
                timestamp: Date.now()
            }
        }));

    } else {

        hasValidSpeech = false;

    }

}

/* ------------------------------------------------ */
/* SILENCE TIMER */
/* ------------------------------------------------ */

function startSilenceTimer() {

    clearSilenceTimer();

    if (!hasValidSpeech || timeout <= 0) return;

    silenceStartTime = Date.now();

    silenceTimer = setTimeout(() => {

        if (onSilenceCallback) {
            onSilenceCallback();
        }

        document.dispatchEvent(new CustomEvent('silence-detected', {
            detail: {
                timeout,
                timestamp: Date.now()
            }
        }));

        hasValidSpeech = false;

    }, timeout);

}

/* ------------------------------------------------ */
/* RESET TIMER */
/* ------------------------------------------------ */

export function resetSilenceTimer() {

    if (!hasValidSpeech) return;

    startSilenceTimer();

}

/* ------------------------------------------------ */
/* CONTROL */
/* ------------------------------------------------ */

export function clearSilenceTimer() {

    if (silenceTimer) {

        clearTimeout(silenceTimer);
        silenceTimer = null;

    }

}

/* ------------------------------------------------ */
/* SETTINGS */
/* ------------------------------------------------ */

export function setSilenceTimeout(newTimeout) {

    timeout = newTimeout;

}

export function setAudioThreshold(threshold) {

    audioThreshold = Math.max(0, Math.min(100, threshold));

}

/* ------------------------------------------------ */
/* STATE */
/* ------------------------------------------------ */

export function getSpeakingState() {

    return {

        isSpeaking,
        hasValidSpeech,
        speechDuration: isSpeaking
            ? Date.now() - speechStartTime
            : 0,

        lastAudioLevel,
        audioThreshold

    };

}

/* ------------------------------------------------ */
/* RESET */
/* ------------------------------------------------ */

export function resetDetector() {

    clearSilenceTimer();

    isSpeaking = false;
    hasValidSpeech = false;
    consecutiveSilence = 0;

}

/* ------------------------------------------------ */
/* EXPORT */
/* ------------------------------------------------ */

export default {

    initSilenceDetector,
    processAudioLevel,
    resetSilenceTimer,
    clearSilenceTimer,
    setSilenceTimeout,
    setAudioThreshold,
    getSpeakingState,
    resetDetector

};