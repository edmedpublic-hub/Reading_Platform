// static/reading/reading.listen.js
// PURPOSE: Coordinates speech recognition with highlighting and feedback
// DEPENDENCIES: reading.recognition.js, reading.highlight.js, reading.feedback.js
// EXPORTS: initListening, destroyListening, setExpectedText, getStatus

import recognition from './reading.recognition.js';
import highlighting from './reading.highlight.js';
import feedback from './reading.feedback.js';

// Module state (private)
let state = {
    initialized: false,
    expectedText: '',
    isProcessing: false,
    currentTranscript: '',
    processingQueue: [],
    elementIds: {
        startBtn: 'startListeningBtn',
        stopBtn: 'stopListeningBtn',
        status: 'recording-status',
        transcript: 'live-transcript',
        warning: 'listening-warning'
    },
    callbacks: {
        onInterimUpdate: null,
        onProcessingStart: null,
        onProcessingComplete: null,
        onProcessingError: null,
        onStatusChange: null
    },
    config: {
        minTranscriptLength: 10,
        autoEvaluate: true,
        showLiveTranscript: true,
        debounceTime: 100,
        maxQueueSize: 5,
        highlightEnabled: true,
        feedbackEnabled: true
    }
};

// DOM element references
let elements = {};

// Debounce timer
let interimTimer = null;

/**
 * Initialize the listening coordinator
 * @param {string} expectedText - The expected text for comparison
 * @param {Object} options - Configuration options
 * @returns {Object} Public API
 */
export function initListening(expectedText = '', options = {}) {
    // Prevent double initialization
    if (state.initialized) {
        console.warn('Listening coordinator already initialized');
        updateExpectedText(expectedText);
        return getPublicAPI();
    }

    // Merge options
    mergeOptions(options);

    // Store expected text
    state.expectedText = expectedText || '';

    // Get DOM elements
    getElements();

    // Set up event listeners
    setupEventListeners();

    // Set up recognition callbacks if not already set
    setupRecognitionCallbacks();

    state.initialized = true;
    console.log('Listening coordinator initialized');

    return getPublicAPI();
}

/**
 * Merge options with defaults
 * @param {Object} options - User options
 */
function mergeOptions(options) {
    if (options.elementIds) {
        state.elementIds = { ...state.elementIds, ...options.elementIds };
    }

    if (options.callbacks) {
        state.callbacks = { ...state.callbacks, ...options.callbacks };
    }

    if (options.config) {
        state.config = { ...state.config, ...options.config };
    }
}

/**
 * Get DOM elements
 */
function getElements() {
    elements = {
        startBtn: document.getElementById(state.elementIds.startBtn),
        stopBtn: document.getElementById(state.elementIds.stopBtn),
        status: document.getElementById(state.elementIds.status),
        transcript: document.getElementById(state.elementIds.transcript),
        warning: document.getElementById(state.elementIds.warning)
    };
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Listen for recognition events
    document.addEventListener('recognition-started', handleRecognitionStarted);
    document.addEventListener('recognition-stopped', handleRecognitionStopped);
    document.addEventListener('recognition-interim', handleInterimResult);
    document.addEventListener('recording-complete', handleRecordingComplete);
    document.addEventListener('recognition-error', handleRecognitionError);

    // Listen for feedback events
    document.addEventListener('feedback-success', handleFeedbackSuccess);
    document.addEventListener('feedback-error', handleFeedbackError);

    // Set up button handlers as fallback
    setupButtonHandlers();
}

/**
 * Set up recognition callbacks
 */
function setupRecognitionCallbacks() {
    // These will be used if recognition module supports callbacks directly
    // But we primarily rely on events for loose coupling
}

/**
 * Set up button handlers
 */
function setupButtonHandlers() {
    if (elements.startBtn && !elements.startBtn._listenerAttached) {
        elements.startBtn.addEventListener('click', startListening);
        elements.startBtn._listenerAttached = true;
    }

    if (elements.stopBtn && !elements.stopBtn._listenerAttached) {
        elements.stopBtn.addEventListener('click', stopListening);
        elements.stopBtn._listenerAttached = true;
    }
}

/**
 * Update expected text (e.g., when lesson changes)
 * @param {string} text - New expected text
 */
export function updateExpectedText(text) {
    state.expectedText = text || '';
    console.log('Expected text updated');
}

/**
 * Start listening
 */
export function startListening() {
    // Clear any previous state
    state.currentTranscript = '';
    state.isProcessing = false;
    state.processingQueue = [];

    // Update UI
    updateUI('listening');

    // Start recognition
    recognition.start();
}

/**
 * Stop listening
 */
export function stopListening() {
    recognition.stop();
    // UI will be updated via events
}

/**
 * Handle recognition started event
 */
function handleRecognitionStarted() {
    updateUI('listening');
    triggerCallback('onStatusChange', { status: 'listening' });
}

/**
 * Handle recognition stopped event
 */
function handleRecognitionStopped(event) {
    updateUI('idle');
    triggerCallback('onStatusChange', { status: 'idle' });
}

/**
 * Handle interim results from recognition
 * @param {CustomEvent} event - Interim result event
 */
function handleInterimResult(event) {
    const transcript = event.detail?.transcript || '';
    
    if (!transcript) return;

    state.currentTranscript = transcript;

    // Update live transcript display
    if (state.config.showLiveTranscript && elements.transcript) {
        elements.transcript.textContent = transcript;
    }

    // Debounce highlighting to avoid too many updates
    if (interimTimer) clearTimeout(interimTimer);
    
    interimTimer = setTimeout(() => {
        if (state.config.highlightEnabled && state.expectedText) {
            // Update highlighting in real-time
            highlighting.update(transcript);
        }
        
        triggerCallback('onInterimUpdate', { transcript });
    }, state.config.debounceTime);
}

/**
 * Handle recording complete event
 * @param {CustomEvent} event - Recording complete event
 */
async function handleRecordingComplete(event) {
    const transcript = event.detail?.transcript || state.currentTranscript;
    
    if (!transcript || transcript.length < state.config.minTranscriptLength) {
        showWarning(`Recording too short (minimum ${state.config.minTranscriptLength} characters)`);
        return;
    }

    // Prevent multiple simultaneous processing
    if (state.isProcessing) {
        // Queue this transcript for later processing
        if (state.processingQueue.length < state.config.maxQueueSize) {
            state.processingQueue.push(transcript);
            showWarning('Processing in progress. Your speech has been queued.');
        }
        return;
    }

    state.isProcessing = true;
    updateUI('processing');
    triggerCallback('onProcessingStart', { transcript });

    try {
        if (state.config.feedbackEnabled && state.expectedText) {
            // Get lesson ID from various sources
            const lessonId = getLessonId();

            // Send to feedback API
            const result = await feedback.evaluate(
                transcript,
                state.expectedText,
                lessonId
            );

            // Process next in queue if any
            processNextInQueue();

            triggerCallback('onProcessingComplete', { transcript, result });
        }
    } catch (error) {
        console.error('Processing failed:', error);
        showWarning('Failed to process recording. Please try again.');
        triggerCallback('onProcessingError', { transcript, error: error.message });
        
        // Reset processing state
        state.isProcessing = false;
    } finally {
        // Don't set isProcessing false here - it will be set by processNextInQueue
    }
}

/**
 * Process next item in queue
 */
async function processNextInQueue() {
    if (state.processingQueue.length > 0) {
        const nextTranscript = state.processingQueue.shift();
        
        // Small delay before processing next
        setTimeout(() => {
            handleRecordingComplete({ 
                detail: { transcript: nextTranscript } 
            });
        }, 500);
    } else {
        // Queue is empty, we're done processing
        state.isProcessing = false;
        updateUI('idle');
    }
}

/**
 * Handle recognition error
 * @param {CustomEvent} event - Error event
 */
function handleRecognitionError(event) {
    const error = event.detail?.message || 'Unknown error';
    showWarning(`Recognition error: ${error}`);
    updateUI('idle');
    triggerCallback('onProcessingError', { error });
}

/**
 * Handle feedback success
 * @param {CustomEvent} event - Feedback success event
 */
function handleFeedbackSuccess(event) {
    // Feedback has been processed and displayed by feedback module
    // We just need to update our state
    console.log('Feedback received successfully');
}

/**
 * Handle feedback error
 * @param {CustomEvent} event - Feedback error event
 */
function handleFeedbackError(event) {
    const error = event.detail?.error || 'Unknown error';
    showWarning(`Feedback error: ${error}`);
}

/**
 * Get lesson ID from DOM or state
 * @returns {string|null} Lesson ID
 */
function getLessonId() {
    // Try to get from reading app container
    const appContainer = document.getElementById('reading-app');
    if (appContainer?.dataset?.lessonId) {
        return appContainer.dataset.lessonId;
    }
    
    // Try to get from window.currentLesson (set by main.js)
    if (window.currentLesson?.id) {
        return window.currentLesson.id;
    }
    
    return null;
}

/**
 * Update UI based on current state
 * @param {string} status - Current status ('idle', 'listening', 'processing')
 */
function updateUI(status) {
    if (!elements.startBtn || !elements.stopBtn) return;

    switch (status) {
        case 'listening':
            elements.startBtn.disabled = true;
            elements.stopBtn.disabled = false;
            if (elements.status) {
                elements.status.innerHTML = '<span class="recording-indicator active"><span class="recording-dot"></span> Listening... Speak now</span>';
                elements.status.classList.remove('d-none');
            }
            hideWarning();
            break;

        case 'processing':
            elements.startBtn.disabled = true;
            elements.stopBtn.disabled = true;
            if (elements.status) {
                elements.status.innerHTML = '<span class="processing-indicator"><span class="spinner-small"></span> Processing your speech...</span>';
                elements.status.classList.remove('d-none');
            }
            break;

        case 'idle':
        default:
            elements.startBtn.disabled = false;
            elements.stopBtn.disabled = true;
            if (elements.status) {
                elements.status.classList.add('d-none');
            }
            break;
    }
}

/**
 * Show warning message
 * @param {string} message - Warning message
 */
function showWarning(message) {
    if (elements.warning) {
        elements.warning.textContent = message;
        elements.warning.classList.remove('d-none');
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (elements.warning) {
                elements.warning.classList.add('d-none');
            }
        }, 3000);
    }
}

/**
 * Hide warning message
 */
function hideWarning() {
    if (elements.warning) {
        elements.warning.classList.add('d-none');
    }
}

/**
 * Clear live transcript display
 */
export function clearTranscript() {
    state.currentTranscript = '';
    if (elements.transcript) {
        elements.transcript.textContent = '';
    }
}

/**
 * Get current status
 * @returns {Object} Current status
 */
export function getStatus() {
    return {
        isListening: recognition.isListening?.(),
        isProcessing: state.isProcessing,
        hasExpectedText: !!state.expectedText,
        queueLength: state.processingQueue.length,
        currentTranscript: state.currentTranscript
    };
}

/**
 * Set configuration options
 * @param {Object} config - Configuration options
 */
export function setConfig(config) {
    state.config = { ...state.config, ...config };
}

/**
 * Trigger callback if exists
 * @param {string} name - Callback name
 * @param {Object} data - Callback data
 */
function triggerCallback(name, data) {
    if (state.callbacks[name] && typeof state.callbacks[name] === 'function') {
        try {
            state.callbacks[name](data);
        } catch (error) {
            console.error(`Callback ${name} failed:`, error);
        }
    }
}

/**
 * Destroy listening coordinator and clean up
 */
export function destroyListening() {
    // Remove event listeners
    document.removeEventListener('recognition-started', handleRecognitionStarted);
    document.removeEventListener('recognition-stopped', handleRecognitionStopped);
    document.removeEventListener('recognition-interim', handleInterimResult);
    document.removeEventListener('recording-complete', handleRecordingComplete);
    document.removeEventListener('recognition-error', handleRecognitionError);
    document.removeEventListener('feedback-success', handleFeedbackSuccess);
    document.removeEventListener('feedback-error', handleFeedbackError);

    // Clear timers
    if (interimTimer) {
        clearTimeout(interimTimer);
        interimTimer = null;
    }

    // Remove button listeners
    if (elements.startBtn && elements.startBtn._listenerAttached) {
        elements.startBtn.removeEventListener('click', startListening);
        delete elements.startBtn._listenerAttached;
    }

    if (elements.stopBtn && elements.stopBtn._listenerAttached) {
        elements.stopBtn.removeEventListener('click', stopListening);
        delete elements.stopBtn._listenerAttached;
    }

    // Reset state
    state.initialized = false;
    state.isProcessing = false;
    state.processingQueue = [];
    state.currentTranscript = '';

    console.log('Listening coordinator destroyed');
}

/**
 * Get public API
 * @returns {Object} Public methods
 */
function getPublicAPI() {
    return {
        init: initListening,
        start: startListening,
        stop: stopListening,
        setExpectedText: updateExpectedText,
        clearTranscript,
        getStatus,
        setConfig,
        destroy: destroyListening
    };
}

// Export public API
export default getPublicAPI();