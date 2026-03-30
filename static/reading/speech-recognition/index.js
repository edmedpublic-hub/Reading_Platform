// static/reading/speech-recognition/index.js
// PURPOSE: Public API for speech recognition module with analysis integration

import {
    isSpeechRecognitionSupported,
    getErrorMessage,
    getRecognitionLanguage,
    detectTextLanguage
} from './utils/recognition-utils.js';

import {
    requestMicrophone,
    onPermissionChange
} from './components/microphone.js';

import {
    initRecognizer,
    start,
    stop,
    abort,
    getTranscript,
    resetTranscript,
    setLanguage,
    setExpectedText as setRecognizerExpectedText
} from './components/recognizer.js';

import {
    initSilenceDetector,
    processAudioLevel,
    clearSilenceTimer,
    resetDetector
} from './components/silence-detector.js';

import EventBus from '../core/event-bus.js';
import { analyzeReading } from '../reading.analysis.js';

let initialized = false;
let _isListening = false;
let restartTimeout = null;
let retryCount = 0;

let expectedText = '';
let currentLanguage = 'en';
let ttsAPI = null;

// Store the current sentence being read by TTS
let currentSentence = '';

// Fallback defaults
let elementIds = {
    startBtn: 'startListeningBtn',
    stopBtn: 'stopListeningBtn',
    status: 'recording-status',
    visualizer: 'audio-visualizer',
    feedbackContainer: 'readingDetails',
    problemWordsContainer: 'problemWords'
};

let callbacks = {};
let config = {
    lang: 'en-US',
    continuous: true,           // Keep listening continuously
    interimResults: true,
    maxAlternatives: 3,
    silenceTimeout: 0,          // Disabled - no auto-stop on silence
    minSpeechLength: 10,
    showVisualizer: false,
    audioThreshold: 10,
    analyzeOnStop: true         // Only analyze when Stop button is clicked
};

let elements = {};

/* ---------------------------------------------------- */
/* INIT */
/* ---------------------------------------------------- */

export function init(options = {}) {
    if (initialized) return getPublicAPI();

    // SYNCED: Handle both nested and direct options from ModuleLoader
    if (options.startBtn) elementIds.startBtn = options.startBtn;
    if (options.stopBtn) elementIds.stopBtn = options.stopBtn;
    if (options.status) elementIds.status = options.status;
    if (options.feedbackContainer) elementIds.feedbackContainer = options.feedbackContainer;
    
    // Check for nested versions just in case
    if (options.elementIds) {
        elementIds = { ...elementIds, ...options.elementIds };
    }

    if (options.config) {
        config = { ...config, ...options.config };
    }

    if (options.ttsAPI) {
        ttsAPI = options.ttsAPI;
    }

    currentLanguage = options.language || 'en';

    if (!isSpeechRecognitionSupported()) {
        handleNoSupport();
        return getPublicAPI();
    }

    // Capture DOM elements based on IDs
    getElements();

    // Verify critical elements
    if (!elements.startBtn) {
        console.error(`❌ STT: Start button not found with ID: ${elementIds.startBtn}`);
        return null; 
    }

    const recognizerReady = initRecognizer({
        config: {
            lang: getRecognitionLanguage(currentLanguage),
            continuous: config.continuous,
            interimResults: config.interimResults,
            maxAlternatives: config.maxAlternatives
        },
        callbacks: {
            onStart: handleRecognitionStart,
            onEnd: handleRecognitionEnd,
            onError: handleRecognitionError,
            onResult: handleRecognitionResult,
            onSpeechStart: handleSpeechStart,
            onSpeechEnd: handleSpeechEnd
        }
    });

    if (!recognizerReady) {
        handleNoSupport();
        return getPublicAPI();
    }

    initSilenceDetector({
        silenceTimeout: config.silenceTimeout,
        minSpeechDuration: 100,
        audioThreshold: config.audioThreshold,
        onSilence: handleSilenceTimeout,
        onSpeechStart: handleSpeechStart,
        onSpeechEnd: handleSpeechEnd
    });

    onPermissionChange((granted) => {
        if (callbacks.onPermissionChange) callbacks.onPermissionChange(granted);
    });

    setupButtonListeners();

    // Event Bus bindings
    EventBus.on('recognition:start', startListening);
    EventBus.on('recognition:stop', stopListening);
    EventBus.on('recognition:abort', abort);

    // Listen for TTS progress to update expected text for pronunciation
    document.addEventListener('tts-progress', (event) => {
        const sentence = event.detail.text;
        if (sentence && sentence.length > 0) {
            // Store the current sentence for comparison
            currentSentence = sentence;
            setExpectedText(sentence);
        }
    });

    initialized = true;

    return getPublicAPI();
}

/* ---------------------------------------------------- */
/* DOM ELEMENTS */
/* ---------------------------------------------------- */

function getElements() {
    elements = {
        startBtn: document.getElementById(elementIds.startBtn),
        stopBtn: document.getElementById(elementIds.stopBtn),
        status: document.getElementById(elementIds.status),
        visualizer: document.getElementById(elementIds.visualizer),
        feedbackContainer: document.getElementById(elementIds.feedbackContainer),
        problemWordsContainer: document.getElementById(elementIds.problemWordsContainer)
    };
}

/* ---------------------------------------------------- */
/* BUTTON LISTENERS */
/* ---------------------------------------------------- */

function setupButtonListeners() {
    if (elements.startBtn && !elements.startBtn._listenerAttached) {
        elements.startBtn.addEventListener('click', startListening);
        elements.startBtn._listenerAttached = true;
    }

    if (elements.stopBtn && !elements.stopBtn._listenerAttached) {
        elements.stopBtn.addEventListener('click', stopListening);
        elements.stopBtn._listenerAttached = true;
    }
}

/* ---------------------------------------------------- */
/* ACTIONS */
/* ---------------------------------------------------- */

export async function startListening() {
    if (_isListening) return true;
    
    // Mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Mobile: Show permission request instructions on first attempt
    if (isMobile && !localStorage.getItem('microphone-prompt-shown')) {
        showStatus('🎤 Tap "Allow" when prompted for microphone access', 'info');
        localStorage.setItem('microphone-prompt-shown', 'true');
    }
    
    try {
        await requestMicrophone({
            enableVisualizer: config.showVisualizer,
            visualizerEl: elements.visualizer,
            enableLevelMonitoring: true,
            onAudioLevel: handleAudioLevel
        });

        resetTranscript();
        start();
        _isListening = true;
        updateUI(true);
        
        // Mobile: Show recording indicator
        if (isMobile && elements.status) {
            elements.status.classList.add('recording-mobile');
        }
        
        return true;
    } catch (error) {
        console.error('STT Start failed', error);
        
        // Mobile-specific error messages
        if (isMobile) {
            if (error.message === 'Permission denied' || error.name === 'NotAllowedError') {
                showStatus('🎤 Microphone access denied. Please check browser settings and allow microphone.', 'error');
                setTimeout(() => {
                    showStatus('💡 Tip: Tap the camera/mic icon in the address bar to allow access', 'info');
                }, 3000);
            } else if (error.name === 'NotFoundError') {
                showStatus('🎤 No microphone found on this device.', 'error');
            } else if (error.name === 'NotReadableError') {
                showStatus('🎤 Microphone is in use by another application.', 'error');
            } else {
                showStatus('🎤 Microphone not available. Please check your device settings.', 'error');
            }
        } else {
            handleRecognitionError({ error: 'service-not-allowed' });
        }
        
        return false;
    }
}

export function stopListening() {
    if (!_isListening) return;
    
    // Stop recognition
    stop();
    _isListening = false;
    updateUI(false);
    clearSilenceTimer();
    
    // Get final transcript and analyze
    const transcriptObj = getTranscript(false);
    const finalTranscript = transcriptObj.final || transcriptObj.full || transcriptObj.interim || '';
    
    // Only analyze when Stop button is clicked
    if (config.analyzeOnStop && finalTranscript.length >= config.minSpeechLength) {
        analyzeAndDisplayFeedback(finalTranscript);
    } else if (finalTranscript.length < config.minSpeechLength) {
        showStatus('No speech detected. Please try again.', 'error');
    }
}

/* ---------------------------------------------------- */
/* HANDLERS */
/* ---------------------------------------------------- */

function handleAudioLevel(levelData) {
    processAudioLevel(levelData);
}

function handleSpeechStart() {
    dispatchEvent('speech-start');
}

function handleSpeechEnd() {
    dispatchEvent('speech-end');
}

function handleRecognitionStart() {
    updateUI(true);
}

function handleRecognitionEnd() {
    // Recognition ended (could be from error or external stop)
    // We don't auto-analyze here anymore - analysis is done in stopListening
    _isListening = false;
    updateUI(false);
    
    EventBus.emit('recognition:end', { transcript: getTranscript(false) });
}

function handleRecognitionError(event) {
    const error = event.error || 'unknown';
    console.error('STT Error:', error);
    showStatus(getErrorMessage(error, currentLanguage), 'error');
}

function handleRecognitionResult(result) {
    dispatchEvent('speech-interim', {
        transcript: result.transcript,
        interim: result.interim,
        final: result.final
    });
    
    // Show live transcript for better UX
    if (result.transcript && elements.status) {
        const shortTranscript = result.transcript.length > 60 
            ? result.transcript.substring(0, 60) + '...' 
            : result.transcript;
        showStatus(`🎤 Listening: "${shortTranscript}"`, 'speech');
    }
}

function handleSilenceTimeout() {
    // Silence detected - just reset the detector, don't stop listening
    resetDetector();
    // Optionally show a subtle indicator
    if (elements.status && _isListening) {
        // Briefly flash to indicate silence detected but still listening
        elements.status.style.opacity = '0.7';
        setTimeout(() => {
            if (elements.status) elements.status.style.opacity = '1';
        }, 200);
    }
}

function analyzeAndDisplayFeedback(transcript) {
    // Use the stored current sentence
    const sentenceToCompare = currentSentence || expectedText;
    
    if (!transcript || transcript.length === 0) {
        showStatus('No speech detected. Please try again.', 'error');
        return;
    }
    
    if (!sentenceToCompare || sentenceToCompare.length === 0) {
        showStatus('Please wait for TTS to start reading before speaking.', 'info');
        return;
    }
    
    try {
        const analysis = analyzeReading(transcript, sentenceToCompare, {
            ignorePunctuation: true,
            ignoreCase: true,
            ignoreArabicDiacritics: true
        });

        // Calculate score from the analysis
        const totalWords = (analysis.correct?.length || 0) + (analysis.incorrect?.length || 0);
        const score = totalWords > 0 ? Math.round((analysis.correct?.length || 0) / totalWords * 100) : 0;
        
        // Extract problem words - ensure we get strings
        const problemWords = (analysis.incorrect || []).map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                return item.word || item.text || item.original || '';
            }
            return String(item);
        }).filter(w => w && w.length > 0 && w !== '[object Object]');
        
        // Extract correct words
        const correctWords = (analysis.correct || []).map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                return item.word || item.text || '';
            }
            return String(item);
        }).filter(w => w && w.length > 0 && w !== '[object Object]');
        
        const feedbackData = {
            transcript: transcript,
            expected: sentenceToCompare,
            score: score,
            problemWords: problemWords,
            correctWords: correctWords,
            totalWords: totalWords,
            accuracy: score
        };

        // Dispatch event for UI to handle
        console.log('📡 Dispatching pronunciation-feedback event with:', feedbackData);
        document.dispatchEvent(new CustomEvent('pronunciation-feedback', {
            detail: feedbackData
        }));

        EventBus.emit('recognition:complete', { transcript, analysis: feedbackData });
        
        // Show feedback in status
        let message = '';
        if (score >= 85) {
            message = `🎉 Excellent! Score: ${score}%`;
        } else if (score >= 70) {
            message = `👍 Good job! Score: ${score}%`;
        } else if (score >= 50) {
            message = `📖 Good effort. Score: ${score}%. Keep practicing!`;
        } else {
            message = `💪 Score: ${score}%. Try repeating the difficult words.`;
        }
        showStatus(message, score >= 70 ? 'success' : 'info');
        
    } catch (error) {
        console.error('Analysis failed', error);
        showStatus('Error analyzing speech. Please try again.', 'error');
    }
}

/* ---------------------------------------------------- */
/* UI HELPERS */
/* ---------------------------------------------------- */

function updateUI(active) {
    if (elements.startBtn) elements.startBtn.disabled = active;
    if (elements.stopBtn) elements.stopBtn.disabled = !active;

    if (active) {
        showStatus('🎤 Listening... Speak clearly', 'speech');
    } else {
        if (elements.status) elements.status.classList.add('d-none');
    }
}

function showStatus(message, type = 'info') {
    if (!elements.status) return;
    elements.status.innerHTML = `<span class="status-${type}">${message}</span>`;
    elements.status.classList.remove('d-none');
}

function dispatchEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(`recognition-${name}`, {
        detail: { ...detail, timestamp: Date.now() }
    }));
}

export function setExpectedText(text) {
    expectedText = text;
    setRecognizerExpectedText(text);
}

function handleNoSupport() {
    console.error('❌ Speech recognition not supported in this browser');
    showStatus('Speech not supported', 'error');
}

export function isListening() {
    return _isListening;
}

export function getPublicAPI() {
    return {
        init,
        start: startListening,
        stop: stopListening,
        isListening,
        setExpectedText,
        getTranscript
    };
}

export default getPublicAPI();