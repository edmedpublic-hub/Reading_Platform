// static/reading/text-to-speech/engine.js
// PURPOSE: Core speech synthesis engine with consistent state management

import { getSelectedVoice, findArabicVoice, findBestVoiceForText, areVoicesLoaded } from './components/voice-selector.js';
import { hasArabic, isMobile } from './utils/tts-utils.js';

let synth = null;
let currentUtterance = null;
let isSpeaking = false;
let isPaused = false;
let isStopping = false;

let config = {
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    lang: 'en-US',
    wordHighlighting: false
};

let callbacks = {
    onStart: null,
    onEnd: null,
    onError: null,
    onPause: null,
    onResume: null,
    onBoundary: null,
    onVoicesReady: null
};

/* -----------------------------------------
   INIT
----------------------------------------- */

export function initEngine(options = {}) {
    if (!window.speechSynthesis) {
        console.error('Speech synthesis not supported');
        return false;
    }

    synth = window.speechSynthesis;

    if (options.config) config = { ...config, ...options.config };
    if (options.callbacks) callbacks = { ...callbacks, ...options.callbacks };

    // Ensure voices are loaded
    if (synth.getVoices().length === 0) {
        synth.addEventListener('voiceschanged', () => {
            // Voices loaded
        });
    }

    if (isMobile() && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
        window.speechSynthesis.getVoices();
    }

    return true;
}

/* -----------------------------------------
   UTTERANCE CREATION
----------------------------------------- */

export async function createUtterance(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Find the best voice for the text
    const bestVoice = findBestVoiceForText(text);
    
    if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang;
    } else {
        // Fallback to language detection
        const arabic = hasArabic(text);
        if (arabic) {
            utterance.lang = 'ar-SA';
        } else {
            utterance.lang = config.lang;
        }
        
        const selectedVoice = getSelectedVoice();
        if (selectedVoice) utterance.voice = selectedVoice;
    }

    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    utterance.volume = config.volume;

    return utterance;
}

/* -----------------------------------------
   SPEAK
----------------------------------------- */

export function speak(utterance) {
    if (!synth) {
        console.error('Engine not initialized');
        return;
    }

    // Clean up previous utterance
    if (currentUtterance) {
        try {
            currentUtterance.onstart = null;
            currentUtterance.onend = null;
            currentUtterance.onerror = null;
            currentUtterance.onpause = null;
            currentUtterance.onresume = null;
        } catch (e) {}
    }
    
    isStopping = false;
    currentUtterance = utterance;
    
    // Save original handlers
    const originalOnStart = utterance.onstart;
    const originalOnEnd = utterance.onend;
    const originalOnError = utterance.onerror;
    const originalOnPause = utterance.onpause;
    const originalOnResume = utterance.onresume;
    
    utterance.onstart = () => {
        if (isStopping) return;
        isSpeaking = true;
        isPaused = false;
        callbacks.onStart?.();
        if (originalOnStart) originalOnStart();
    };

    utterance.onend = () => {
        if (isStopping) return;
        isSpeaking = false;
        isPaused = false;
        callbacks.onEnd?.();
        if (originalOnEnd) originalOnEnd();
    };

    utterance.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
            if (originalOnError) originalOnError(e);
            return;
        }
        console.error('Speech synthesis error:', e.error);
        isSpeaking = false;
        isPaused = false;
        callbacks.onError?.(e);
        if (originalOnError) originalOnError(e);
    };

    utterance.onpause = () => {
        if (isStopping) return;
        isPaused = true;
        callbacks.onPause?.();
        if (originalOnPause) originalOnPause();
    };

    utterance.onresume = () => {
        if (isStopping) return;
        isPaused = false;
        callbacks.onResume?.();
        if (originalOnResume) originalOnResume();
    };

    if (config.wordHighlighting) {
        utterance.onboundary = (event) => {
            callbacks.onBoundary?.(event);
        };
    }

    try {
        synth.speak(utterance);
    } catch (error) {
        console.error('Error in speak():', error);
        currentUtterance = null;
        isSpeaking = false;
        isPaused = false;
    }
}

/* -----------------------------------------
   CONTROLS
----------------------------------------- */

export function pause() {
    if (!synth || !synth.speaking || isStopping) return;
    
    try {
        synth.pause();
        isPaused = true;
        isSpeaking = true;
    } catch (error) {
        console.debug('Pause error:', error);
    }
}

export function resume() {
    if (!synth || !currentUtterance || isStopping) return;
    
    try {
        if (synth.paused) {
            synth.resume();
        } else if (isPaused && currentUtterance) {
            // Force restart the current utterance
            const utterance = currentUtterance;
            currentUtterance = null;
            
            if (synth.speaking) {
                synth.cancel();
            }
            
            setTimeout(() => {
                if (!isStopping) {
                    speak(utterance);
                }
            }, 50);
        }
    } catch (error) {
        console.debug('Resume error:', error);
    }
    
    isPaused = false;
    isSpeaking = true;
}

export function stop() {
    if (!synth) return;
    
    isStopping = true;
    
    try {
        // Clear event handlers to prevent callbacks
        if (currentUtterance) {
            currentUtterance.onstart = null;
            currentUtterance.onend = null;
            currentUtterance.onerror = null;
            currentUtterance.onpause = null;
            currentUtterance.onresume = null;
            currentUtterance = null;
        }
        
        if (synth.speaking || synth.paused) {
            synth.cancel();
        }
    } catch (error) {
        console.debug('Stop error:', error);
    }

    isSpeaking = false;
    isPaused = false;
    
    // Reset stopping flag after a short delay
    setTimeout(() => {
        isStopping = false;
    }, 100);
}

/* -----------------------------------------
   STATE
----------------------------------------- */

export function isSpeakingNow() {
    return isSpeaking;
}

export function isPausedNow() {
    return isPaused;
}

/* -----------------------------------------
   EXPORT
----------------------------------------- */

export default {
    initEngine,
    createUtterance,
    speak,
    pause,
    resume,
    stop,
    isSpeakingNow,
    isPausedNow
};