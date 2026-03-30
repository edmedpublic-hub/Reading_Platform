// static/reading/reading.recognition.js
// PURPOSE: Speech recognition engine with microphone management and event system
// DEPENDENCIES: None (uses native Web Speech API)
// EXPORTS: initRecognition, startListening, stopListening, isListening, getTranscript

// Module state (private)
let state = {
    initialized: false,
    recognition: null,
    isListening: false,
    hasPermission: false,
    transcriptAccumulator: '',
    finalTranscript: '',
    interimTranscript: '',
    retryCount: 0,
    maxRetries: 3,
    restartTimeout: null,
    elementIds: {
        startBtn: 'startListeningBtn',
        stopBtn: 'stopListeningBtn',
        status: 'recording-status',
        visualizer: 'audio-visualizer'
    },
    callbacks: {
        onStart: null,
        onStop: null,
        onInterim: null,
        onFinal: null,
        onComplete: null,
        onError: null,
        onPermissionChange: null
    },
    config: {
        lang: 'en-US',
        continuous: true,
        interimResults: true,
        maxAlternatives: 1,
        autoRestart: false,
        restartDelay: 1000,
        silenceTimeout: 2000,      // ms of silence before auto-stop
        minSpeechLength: 10,        // minimum characters to consider valid
        showVisualizer: false        // whether to show audio visualizer
    }
};

// DOM element references
let elements = {};

// Audio context for visualizer (if enabled)
let audioContext = null;
let analyser = null;
let microphone = null;
let visualizationFrame = null;

/**
 * Initialize speech recognition
 * @param {Object} options - Configuration options
 * @returns {Object} Public API
 */
export function initRecognition(options = {}) {
    // Prevent double initialization
    if (state.initialized) {
        console.warn('Recognition already initialized');
        return getPublicAPI();
    }

    // Merge options
    mergeOptions(options);

    // Check for browser support
    if (!checkBrowserSupport()) {
        handleNoSupport();
        return getPublicAPI();
    }

    // Get DOM elements
    getElements();

    // Create recognition instance
    createRecognition();

    // Set up event listeners
    setupEventListeners();

    // Check initial permission state
    checkPermissions();

    state.initialized = true;
    console.log('Speech recognition initialized');

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
 * Check if browser supports speech recognition
 * @returns {boolean}
 */
function checkBrowserSupport() {
    const SpeechRecognition = window.SpeechRecognition || 
                             window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.error('Speech recognition not supported in this browser');
        return false;
    }

    return true;
}

/**
 * Handle lack of support
 */
function handleNoSupport() {
    // Disable buttons
    const startBtn = document.getElementById(state.elementIds.startBtn);
    const stopBtn = document.getElementById(state.elementIds.stopBtn);

    if (startBtn) {
        startBtn.disabled = true;
        startBtn.title = 'Speech recognition not supported in this browser';
        startBtn.innerHTML = '❌ Not Supported';
    }

    if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.title = 'Speech recognition not supported';
    }

    // Show status
    const statusEl = document.getElementById(state.elementIds.status);
    if (statusEl) {
        statusEl.innerHTML = '⚠️ Speech recognition not available';
        statusEl.classList.remove('d-none');
    }

    // Dispatch event
    dispatchEvent('not-supported', {});
}

/**
 * Get DOM elements
 */
function getElements() {
    elements = {
        startBtn: document.getElementById(state.elementIds.startBtn),
        stopBtn: document.getElementById(state.elementIds.stopBtn),
        status: document.getElementById(state.elementIds.status),
        visualizer: document.getElementById(state.elementIds.visualizer)
    };
}

/**
 * Create recognition instance
 */
function createRecognition() {
    const SpeechRecognition = window.SpeechRecognition || 
                             window.webkitSpeechRecognition;
    
    state.recognition = new SpeechRecognition();

    // Configure
    state.recognition.lang = state.config.lang;
    state.recognition.continuous = state.config.continuous;
    state.recognition.interimResults = state.config.interimResults;
    state.recognition.maxAlternatives = state.config.maxAlternatives;

    // Set up event handlers
    state.recognition.onstart = handleStart;
    state.recognition.onend = handleEnd;
    state.recognition.onerror = handleError;
    state.recognition.onresult = handleResult;
    state.recognition.onspeechstart = handleSpeechStart;
    state.recognition.onspeechend = handleSpeechEnd;
    state.recognition.onaudiostart = handleAudioStart;
    state.recognition.onaudioend = handleAudioEnd;
    state.recognition.onnomatch = handleNoMatch;
    state.recognition.onsoundstart = handleSoundStart;
    state.recognition.onsoundend = handleSoundEnd;
}

/**
 * Set up additional event listeners
 */
function setupEventListeners() {
    // Button listeners
    if (elements.startBtn) {
        elements.startBtn.addEventListener('click', startListening);
    }

    if (elements.stopBtn) {
        elements.stopBtn.addEventListener('click', stopListening);
    }

    // Page visibility change (stop recording when tab hidden)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Before unload (clean up)
    window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Check microphone permissions
 */
async function checkPermissions() {
    try {
        // Check if we can access media devices
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return;
        }

        // Check permission state via Permissions API if available
        if (navigator.permissions && navigator.permissions.query) {
            const result = await navigator.permissions.query({ name: 'microphone' });
            
            state.hasPermission = result.state === 'granted';
            
            result.onchange = () => {
                state.hasPermission = result.state === 'granted';
                updateUI();
                triggerCallback('onPermissionChange', { 
                    state: result.state,
                    hasPermission: state.hasPermission 
                });
            };
        }

        // Get list of devices to check if any microphone exists
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasMicrophone = devices.some(device => device.kind === 'audioinput');
        
        if (!hasMicrophone) {
            dispatchEvent('no-microphone', {});
            showStatus('No microphone found', 'error');
        }

    } catch (error) {
        console.warn('Could not check microphone permissions:', error);
    }
}

/**
 * Start listening
 * @returns {Promise<boolean>} Success status
 */
export async function startListening() {
    if (!state.recognition) {
        console.error('Recognition not initialized');
        return false;
    }

    if (state.isListening) {
        console.log('Already listening');
        return true;
    }

    try {
        // Request microphone permission first
        await requestMicrophonePermission();

        // Reset transcript
        resetTranscript();

        // Start recognition
        state.recognition.start();
        
        // Update state
        state.isListening = true;
        state.retryCount = 0;
        
        // Update UI
        updateUI();
        
        // Trigger callback
        triggerCallback('onStart', {});

        // Dispatch event
        dispatchEvent('started', {});

        // Set up silence detection
        setupSilenceDetection();

        console.log('Started listening');
        return true;

    } catch (error) {
        console.error('Failed to start listening:', error);
        
        handleError({ error: 'not-allowed', message: error.message });
        
        return false;
    }
}

/**
 * Request microphone permission
 * @returns {Promise}
 */
async function requestMicrophonePermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices not supported');
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Set up visualizer if enabled
        if (state.config.showVisualizer) {
            setupVisualizer(stream);
        } else {
            // Stop tracks immediately if we don't need the stream
            stream.getTracks().forEach(track => track.stop());
        }
        
        state.hasPermission = true;
        return stream;

    } catch (error) {
        state.hasPermission = false;
        throw new Error('Microphone permission denied');
    }
}

/**
 * Set up audio visualizer
 * @param {MediaStream} stream - Audio stream
 */
function setupVisualizer(stream) {
    if (!elements.visualizer || !window.AudioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        
        analyser.fftSize = 256;
        microphone.connect(analyser);

        visualize();

    } catch (error) {
        console.warn('Could not set up visualizer:', error);
    }
}

/**
 * Visualize audio levels
 */
function visualize() {
    if (!analyser || !elements.visualizer) return;

    const canvas = elements.visualizer;
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        if (!state.isListening) return;

        visualizationFrame = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = 'rgb(240, 240, 240)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;

            canvasCtx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth + 1;
        }
    }

    draw();
}

/**
 * Stop listening
 */
export function stopListening() {
    if (!state.recognition || !state.isListening) return;

    try {
        state.recognition.stop();
        
        // Don't set isListening false here - wait for onend event
        
    } catch (error) {
        console.error('Error stopping recognition:', error);
        
        // Force stop
        state.isListening = false;
        updateUI();
    }

    // Stop visualizer
    stopVisualizer();

    // Clear silence detection
    clearSilenceDetection();

    console.log('Stopped listening');
}

/**
 * Stop visualizer
 */
function stopVisualizer() {
    if (visualizationFrame) {
        cancelAnimationFrame(visualizationFrame);
        visualizationFrame = null;
    }

    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    analyser = null;

    // Clear canvas
    if (elements.visualizer) {
        const canvas = elements.visualizer;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

/**
 * Reset transcript
 */
function resetTranscript() {
    state.transcriptAccumulator = '';
    state.finalTranscript = '';
    state.interimTranscript = '';
}

/**
 * Get current transcript
 * @param {boolean} includeInterim - Whether to include interim results
 * @returns {string} Current transcript
 */
export function getTranscript(includeInterim = true) {
    if (includeInterim) {
        return (state.finalTranscript + ' ' + state.interimTranscript).trim();
    }
    return state.finalTranscript.trim();
}

/**
 * Check if currently listening
 * @returns {boolean}
 */
export function isListening() {
    return state.isListening;
}

/**
 * Handle recognition start
 */
function handleStart() {
    console.log('Recognition started');
    
    dispatchEvent('recognition-started', {});
}

/**
 * Handle recognition end
 */
function handleEnd() {
    console.log('Recognition ended');

    // If we're still supposed to be listening, restart
    if (state.isListening && state.config.autoRestart) {
        scheduleRestart();
        return;
    }

    // Finalize
    const finalTranscript = state.finalTranscript.trim();
    
    if (finalTranscript && finalTranscript.length >= state.config.minSpeechLength) {
        dispatchEvent('recording-complete', { 
            transcript: finalTranscript,
            final: true
        });
        
        triggerCallback('onComplete', { transcript: finalTranscript });
    }

    // Reset state
    state.isListening = false;
    state.interimTranscript = '';
    
    // Update UI
    updateUI();

    // Trigger callback
    triggerCallback('onStop', { transcript: finalTranscript });
}

/**
 * Schedule restart with backoff
 */
function scheduleRestart() {
    if (state.restartTimeout) {
        clearTimeout(state.restartTimeout);
    }

    const delay = state.config.restartDelay * (state.retryCount + 1);
    
    state.restartTimeout = setTimeout(() => {
        if (state.isListening) {
            try {
                state.recognition.start();
                state.retryCount = 0;
            } catch (error) {
                state.retryCount++;
                if (state.retryCount < state.maxRetries) {
                    scheduleRestart();
                } else {
                    handleError({ error: 'max-retries', message: 'Max retries reached' });
                }
            }
        }
    }, delay);
}

/**
 * Handle recognition error
 * @param {Event} event - Error event
 */
function handleError(event) {
    const error = event.error || event.message || 'Unknown error';
    console.error('Recognition error:', error);

    // Map error to user-friendly message
    const userMessage = getErrorMessage(error);

    // Update UI
    showStatus(userMessage, 'error');

    // Handle specific errors
    switch (error) {
        case 'not-allowed':
        case 'permission-denied':
            state.hasPermission = false;
            state.isListening = false;
            updateUI();
            break;

        case 'no-speech':
            // Just restart if continuous
            if (state.config.autoRestart && state.isListening) {
                scheduleRestart();
            }
            break;

        case 'network':
        case 'service-not-allowed':
            if (state.retryCount < state.maxRetries) {
                scheduleRestart();
            }
            break;
    }

    // Trigger callback
    triggerCallback('onError', { error, message: userMessage });

    // Dispatch event
    dispatchEvent('error', { error, message: userMessage });
}

/**
 * Get user-friendly error message
 * @param {string} error - Error code
 * @returns {string} User-friendly message
 */
function getErrorMessage(error) {
    const messages = {
        'not-allowed': 'Microphone access denied. Please check permissions.',
        'permission-denied': 'Microphone access denied. Please check permissions.',
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'No microphone found. Please connect a microphone.',
        'network': 'Network error. Please check your connection.',
        'not-allowed': 'Microphone access blocked. Please enable in settings.',
        'service-not-allowed': 'Speech service unavailable. Please try again later.',
        'aborted': 'Recording was stopped.',
        'language-not-supported': 'Language not supported.',
        'max-retries': 'Unable to connect. Please try again.'
    };

    return messages[error] || `Recognition error: ${error}`;
}

/**
 * Handle result event
 * @param {SpeechRecognitionEvent} event - Result event
 */
function handleResult(event) {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
            final += transcript + ' ';
            state.finalTranscript += transcript + ' ';
            state.transcriptAccumulator += transcript + ' ';
        } else {
            interim += transcript + ' ';
            state.interimTranscript = interim;
        }
    }

    // Build complete transcript
    const fullTranscript = (state.finalTranscript + state.interimTranscript).trim();

    // Dispatch interim event if we have interim results
    if (interim) {
        dispatchEvent('speech-interim', { 
            transcript: fullTranscript,
            interim: state.interimTranscript.trim(),
            final: state.finalTranscript.trim()
        });
        
        triggerCallback('onInterim', { 
            transcript: fullTranscript,
            interim: state.interimTranscript.trim()
        });
    }

    // Dispatch final event if we have final results
    if (final) {
        dispatchEvent('speech-final', { 
            transcript: final.trim(),
            fullTranscript: state.finalTranscript.trim()
        });
        
        triggerCallback('onFinal', { 
            transcript: final.trim(),
            fullTranscript: state.finalTranscript.trim()
        });
    }

    // Reset silence timer
    resetSilenceDetection();
}

/**
 * Handle speech start
 */
function handleSpeechStart() {
    console.log('Speech detected');
    showStatus('Speaking...', 'speech');
}

/**
 * Handle speech end
 */
function handleSpeechEnd() {
    console.log('Speech ended');
    showStatus('Processing...', 'processing');
}

/**
 * Handle audio start
 */
function handleAudioStart() {
    console.log('Audio started');
}

/**
 * Handle audio end
 */
function handleAudioEnd() {
    console.log('Audio ended');
}

/**
 * Handle no match
 */
function handleNoMatch() {
    console.log('No match found');
    showStatus('No match found', 'warning');
}

/**
 * Handle sound start
 */
function handleSoundStart() {
    console.log('Sound started');
}

/**
 * Handle sound end
 */
function handleSoundEnd() {
    console.log('Sound ended');
}

/**
 * Handle visibility change (stop recording when tab hidden)
 */
function handleVisibilityChange() {
    if (document.hidden && state.isListening) {
        stopListening();
    }
}

/**
 * Handle before unload
 */
function handleBeforeUnload() {
    if (state.isListening) {
        stopListening();
    }

    // Clean up
    if (state.restartTimeout) {
        clearTimeout(state.restartTimeout);
    }
}

/**
 * Silence detection
 */
let silenceTimer = null;

function setupSilenceDetection() {
    resetSilenceDetection();
}

function resetSilenceDetection() {
    if (silenceTimer) {
        clearTimeout(silenceTimer);
    }

    if (state.config.silenceTimeout > 0 && state.isListening) {
        silenceTimer = setTimeout(() => {
            if (state.isListening && !state.interimTranscript) {
                console.log('Silence timeout reached');
                stopListening();
            }
        }, state.config.silenceTimeout);
    }
}

function clearSilenceDetection() {
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }
}

/**
 * Update UI based on current state
 */
function updateUI() {
    if (elements.startBtn) {
        elements.startBtn.disabled = state.isListening;
        elements.startBtn.setAttribute('aria-pressed', state.isListening ? 'false' : 'true');
    }

    if (elements.stopBtn) {
        elements.stopBtn.disabled = !state.isListening;
        elements.stopBtn.setAttribute('aria-pressed', state.isListening ? 'true' : 'false');
    }

    // Update status
    if (elements.status) {
        if (state.isListening) {
            elements.status.innerHTML = `
                <span class="recording-indicator active">
                    <span class="recording-dot"></span>
                    Recording... Speak now
                </span>
            `;
            elements.status.classList.remove('d-none');
        } else {
            elements.status.innerHTML = '';
            elements.status.classList.add('d-none');
        }
    }
}

/**
 * Show status message
 * @param {string} message - Status message
 * @param {string} type - Status type (info, error, warning, speech, processing)
 */
function showStatus(message, type = 'info') {
    if (!elements.status) return;

    let icon = '';
    let className = '';

    switch (type) {
        case 'error':
            icon = '❌';
            className = 'status-error';
            break;
        case 'warning':
            icon = '⚠️';
            className = 'status-warning';
            break;
        case 'speech':
            icon = '🎤';
            className = 'status-speech';
            break;
        case 'processing':
            icon = '⏳';
            className = 'status-processing';
            break;
        default:
            icon = 'ℹ️';
            className = 'status-info';
    }

    elements.status.innerHTML = `<span class="${className}">${icon} ${message}</span>`;
    elements.status.classList.remove('d-none');
}

/**
 * Dispatch custom event
 * @param {string} name - Event name
 * @param {Object} detail - Event detail
 */
function dispatchEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(`recognition-${name}`, {
        detail: { ...detail, timestamp: Date.now() }
    }));
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
 * Destroy recognition module and clean up
 */
export function destroyRecognition() {
    // Stop listening
    if (state.isListening) {
        stopListening();
    }

    // Remove event listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);

    // Clear timeouts
    if (state.restartTimeout) {
        clearTimeout(state.restartTimeout);
    }
    clearSilenceDetection();

    // Stop visualizer
    stopVisualizer();

    // Clean up recognition
    if (state.recognition) {
        state.recognition.onstart = null;
        state.recognition.onend = null;
        state.recognition.onerror = null;
        state.recognition.onresult = null;
        state.recognition.onspeechstart = null;
        state.recognition.onspeechend = null;
        state.recognition = null;
    }

    state.initialized = false;
    console.log('Recognition destroyed');
}

/**
 * Get public API
 * @returns {Object} Public methods
 */
function getPublicAPI() {
    return {
        init: initRecognition,
        start: startListening,
        stop: stopListening,
        isListening: isListening,
        getTranscript: getTranscript,
        destroy: destroyRecognition
    };
}

// Export public API
export default getPublicAPI();