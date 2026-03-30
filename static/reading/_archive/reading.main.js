// static/reading/reading.main.js
// PURPOSE: Main orchestrator that coordinates all reading modules
// DEPENDENCIES: All other reading modules
// EXPORTS: initApp, getAppState, destroyApp

// Import all modules
import textReader from './reading.text.js';
import highlighting from './reading.highlight.js';
import recognition from './reading.recognition.js';
import feedback from '../reading.feedback.js';
import * as ui from '../ui/index.js';

// Module state (private)
let state = {
    initialized: false,
    appContainer: null,
    currentLesson: null,
    isLoading: false,
    error: null,
    isMobile: false,
    moduleStatus: {
        text: false,
        highlight: false,
        recognition: false,
        feedback: false,
        ui: false
    },
    elementIds: {
        appContainer: 'reading-app',
        title: 'lessonTitle',
        text: 'lessonText',
        voiceSelect: 'voiceSelect',
        readBtn: 'readBtn',
        pauseBtn: 'pauseBtn',
        resumeBtn: 'resumeBtn',
        stopBtn: 'stopBtn',
        startListeningBtn: 'startListeningBtn',
        stopListeningBtn: 'stopListeningBtn',
        recordingStatus: 'recording-status',
        scoreDisplay: 'readingScore',
        feedbackText: 'feedbackText',
        problemWords: 'problemWords',
        loadingIndicator: 'readingLoading',
        errorContainer: 'readingError'
    },
    apiEndpoints: {
        lessons: [
            '/reading/api/lessons/{id}/',
            '/api/reading/lessons/{id}/',
            '/reading/lessons/{id}/',
            '/api/lessons/{id}/'
        ],
        feedback: '/reading/api/feedback/'
    },
    callbacks: {
        onLessonLoad: null,
        onLessonError: null,
        onReadingStart: null,
        onReadingStop: null,
        onRecordingStart: null,
        onRecordingStop: null,
        onFeedback: null,
        onError: null
    },
    config: {
        cacheLessons: true,
        cacheTTL: 5 * 60 * 1000,        // 5 minutes
        autoInitModules: true,
        showLoadingIndicator: true,
        retryOnError: true,
        maxRetries: 2,
        mobileOptimizations: true
    }
};

// DOM element references
let elements = {};

// Lesson cache
const lessonCache = new Map();

/**
 * Initialize the reading application
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} App instance
 */
export async function initApp(options = {}) {
    // Prevent double initialization
    if (state.initialized) {
        console.warn('Reading app already initialized');
        return getPublicAPI();
    }

    // Merge options
    mergeOptions(options);

    // Get DOM elements
    if (!getElements()) {
        console.log('Reading app container not found');
        return getPublicAPI();
    }

    // Detect mobile
    state.isMobile = detectMobile();

    // Show loading state
    if (state.config.showLoadingIndicator) {
        showAppLoading();
    }

    // Initialize modules in correct order
    await initializeModules();

    // Load lesson if ID provided
    const lessonId = elements.appContainer?.dataset.lessonId;
    if (lessonId) {
        await loadLesson(lessonId);
    }

    // Set up event listeners
    setupEventListeners();

    state.initialized = true;
    console.log('Reading app initialized', state.isMobile ? '(mobile mode)' : '');

    // Hide loading
    hideAppLoading();

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

    if (options.apiEndpoints) {
        state.apiEndpoints = { ...state.apiEndpoints, ...options.apiEndpoints };
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
 * @returns {boolean} Success status
 */
function getElements() {
    elements = {
        appContainer: document.getElementById(state.elementIds.appContainer),
        title: document.getElementById(state.elementIds.title),
        text: document.getElementById(state.elementIds.text),
        voiceSelect: document.getElementById(state.elementIds.voiceSelect),
        readBtn: document.getElementById(state.elementIds.readBtn),
        pauseBtn: document.getElementById(state.elementIds.pauseBtn),
        resumeBtn: document.getElementById(state.elementIds.resumeBtn),
        stopBtn: document.getElementById(state.elementIds.stopBtn),
        startListeningBtn: document.getElementById(state.elementIds.startListeningBtn),
        stopListeningBtn: document.getElementById(state.elementIds.stopListeningBtn),
        recordingStatus: document.getElementById(state.elementIds.recordingStatus),
        scoreDisplay: document.getElementById(state.elementIds.scoreDisplay),
        feedbackText: document.getElementById(state.elementIds.feedbackText),
        problemWords: document.getElementById(state.elementIds.problemWords),
        loadingIndicator: document.getElementById(state.elementIds.loadingIndicator),
        errorContainer: document.getElementById(state.elementIds.errorContainer)
    };

    return !!elements.appContainer;
}

/**
 * Initialize all modules in correct order
 */
async function initializeModules() {
    try {
        // 1. Initialize UI module first (lowest dependency)
        if (state.config.autoInitModules) {
            await initUIModule();
            
            // 2. Initialize text reader (needs UI)
            await initTextModule();
            
            // 3. Initialize highlighting (needs text structure)
            await initHighlightModule();
            
            // 4. Initialize recognition (needs highlighting)
            await initRecognitionModule();
            
            // 5. Initialize feedback (last, depends on others)
            await initFeedbackModule();
            
            // Initialize progress tracking
            ui.initProgressTracking?.();
        }

    } catch (error) {
        console.error('Failed to initialize modules:', error);
        handleError('Failed to initialize reading features', error);
    }
}

/**
 * Initialize UI module
 */
async function initUIModule() {
    try {
        // UI module doesn't need initialization, just use it
        state.moduleStatus.ui = true;
        console.log('✓ UI module ready');
    } catch (error) {
        console.error('UI module initialization failed:', error);
    }
}

/**
 * Initialize text reader module
 */
async function initTextModule() {
    try {
        textReader.init({
            elementIds: {
                textContainer: state.elementIds.text,
                voiceSelect: state.elementIds.voiceSelect,
                readBtn: state.elementIds.readBtn,
                pauseBtn: state.elementIds.pauseBtn,
                resumeBtn: state.elementIds.resumeBtn,
                stopBtn: state.elementIds.stopBtn
            },
            config: {
                rate: state.isMobile ? 0.9 : 1.0,
                mobileRate: 0.9,
                autoScroll: true
            },
            callbacks: {
                onStart: () => {
                    triggerCallback('onReadingStart', {});
                    updateUIBasedOnState();
                },
                onStop: () => {
                    triggerCallback('onReadingStop', {});
                    updateUIBasedOnState();
                },
                onSentenceChange: (data) => {
                    // Sync with highlighting if needed
                    document.dispatchEvent(new CustomEvent('reading-sentence-changed', {
                        detail: data
                    }));
                },
                onError: (error) => {
                    handleError('Text-to-speech error', error);
                }
            }
        });

        state.moduleStatus.text = true;
        console.log('✓ Text reader module ready');
    } catch (error) {
        console.error('Text reader initialization failed:', error);
    }
}

/**
 * Initialize highlighting module
 */
async function initHighlightModule() {
    try {
        highlighting.init({
            elementIds: {
                container: state.elementIds.text
            },
            config: {
                debounceTime: 50,
                highlightPartial: true,
                partialThreshold: 0.7
            },
            callbacks: {
                onWordUpdate: (stats) => {
                    // Update UI with real-time stats if needed
                }
            }
        });

        state.moduleStatus.highlight = true;
        console.log('✓ Highlighting module ready');
    } catch (error) {
        console.error('Highlighting initialization failed:', error);
    }
}

/**
 * Initialize recognition module
 */
async function initRecognitionModule() {
    try {
        recognition.init({
            elementIds: {
                startBtn: state.elementIds.startListeningBtn,
                stopBtn: state.elementIds.stopListeningBtn,
                status: state.elementIds.recordingStatus
            },
            config: {
                lang: 'en-US',
                continuous: true,
                interimResults: true,
                silenceTimeout: 1800,
                autoRestart: false,
                showVisualizer: state.config.mobileOptimizations ? false : true
            },
            callbacks: {
                onStart: () => {
                    triggerCallback('onRecordingStart', {});
                    updateUIBasedOnState();
                },
                onStop: () => {
                    triggerCallback('onRecordingStop', {});
                    updateUIBasedOnState();
                },
                onInterim: (data) => {
                    // Real-time highlighting
                    if (state.moduleStatus.highlight) {
                        highlighting.update(data.transcript);
                    }
                },
                onComplete: (data) => {
                    // Trigger evaluation
                    if (state.currentLesson && data.transcript) {
                        evaluateReading(data.transcript);
                    }
                },
                onError: (error) => {
                    handleError('Speech recognition error', error);
                }
            }
        });

        state.moduleStatus.recognition = true;
        console.log('✓ Recognition module ready');
    } catch (error) {
        console.error('Recognition initialization failed:', error);
    }
}

/**
 * Initialize feedback module
 */
async function initFeedbackModule() {
    try {
        feedback.init({
            apiEndpoint: state.apiEndpoints.feedback,
            elementIds: {
                scoreDisplay: state.elementIds.scoreDisplay,
                feedbackText: state.elementIds.feedbackText,
                problemWords: state.elementIds.problemWords,
                loadingIndicator: state.elementIds.loadingIndicator,
                errorContainer: state.elementIds.errorContainer
            },
            config: {
                minTextLength: 10,
                maxTextLength: 5000,
                cacheEnabled: true,
                storeHistory: true,
                showDetailedFeedback: true
            },
            callbacks: {
                onSuccess: (result) => {
                    triggerCallback('onFeedback', result);
                    
                    // Update UI with score
                    if (result.score !== undefined) {
                        updateScoreDisplay(result.score);
                    }
                },
                onError: (error) => {
                    handleError('Feedback error', error);
                },
                onOffline: () => {
                    showOfflineIndicator(true);
                }
            }
        });

        state.moduleStatus.feedback = true;
        console.log('✓ Feedback module ready');
    } catch (error) {
        console.error('Feedback initialization failed:', error);
    }
}

/**
 * Load lesson by ID
 * @param {string|number} id - Lesson ID
 */
export async function loadLesson(id) {
    if (!id) {
        handleError('Lesson ID missing');
        return;
    }

    state.isLoading = true;
    showAppLoading();

    // Check cache first
    if (state.config.cacheLessons) {
        const cached = checkLessonCache(id);
        if (cached) {
            renderLesson(cached);
            state.isLoading = false;
            hideAppLoading();
            return;
        }
    }

    let lastError = null;

    // Try each endpoint
    for (const endpointTemplate of state.apiEndpoints.lessons) {
        const url = endpointTemplate.replace('{id}', id);
        
        for (let attempt = 0; attempt <= state.config.maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'Cache-Control': 'no-cache',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (!response.ok) {
                    if (response.status === 404) break; // Don't retry 404
                    throw new Error(`HTTP ${response.status}`);
                }

                const lesson = await response.json();

                // Cache the result
                if (state.config.cacheLessons) {
                    cacheLesson(id, lesson);
                }

                // Render the lesson
                renderLesson(lesson);
                
                state.isLoading = false;
                hideAppLoading();
                
                triggerCallback('onLessonLoad', lesson);
                return;

            } catch (error) {
                lastError = error;
                console.warn(`Failed to load from ${url}:`, error);
                
                if (attempt < state.config.maxRetries && state.config.retryOnError) {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }
    }

    // All attempts failed
    state.isLoading = false;
    hideAppLoading();
    
    const errorMessage = 'Failed to load lesson. Please check your connection.';
    handleError(errorMessage, lastError);
    
    triggerCallback('onLessonError', { error: errorMessage, details: lastError });
}

/**
 * Check lesson cache
 * @param {string|number} id - Lesson ID
 * @returns {Object|null} Cached lesson or null
 */
function checkLessonCache(id) {
    const cached = lessonCache.get(String(id));
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > state.config.cacheTTL) {
        lessonCache.delete(String(id));
        return null;
    }

    return cached.data;
}

/**
 * Cache lesson
 * @param {string|number} id - Lesson ID
 * @param {Object} lesson - Lesson data
 */
function cacheLesson(id, lesson) {
    lessonCache.set(String(id), {
        data: lesson,
        timestamp: Date.now()
    });

    // Limit cache size
    if (lessonCache.size > 20) {
        const oldestKey = lessonCache.keys().next().value;
        lessonCache.delete(oldestKey);
    }
}

/**
 * Render lesson in the UI
 * @param {Object} lesson - Lesson data
 */
function renderLesson(lesson) {
    if (!lesson) return;

    const rawContent = lesson.content || '';
    const sentences = extractSentences(rawContent);

    // Store in state
    state.currentLesson = {
        id: lesson.id,
        title: lesson.title,
        content: rawContent,
        sentences: sentences,
        metadata: lesson.metadata || {}
    };

    // Update page title
    document.title = `${lesson.title} | Reading Platform`;

    // Update title element
    if (elements.title) {
        elements.title.textContent = lesson.title;
    }

    // Render structured text (sentences with word spans)
    if (elements.text) {
        renderStructuredText(rawContent);
    }

    // Prepare highlighting (annotates the structure)
    if (state.moduleStatus.highlight) {
        highlighting.prepare(rawContent, true); // preserve structure
    }

    console.log(`Lesson "${lesson.title}" loaded (${sentences.length} sentences)`);

    // Dispatch event
    document.dispatchEvent(new CustomEvent('lesson-loaded', {
        detail: { lesson: state.currentLesson, timestamp: Date.now() }
    }));
}

/**
 * Render structured text with sentences and word spans
 * @param {string} text - Raw text
 */
function renderStructuredText(text) {
    if (!elements.text) return;

    const sentences = extractSentences(text);
    
    const html = sentences.map((sentence, sIndex) => {
        // Split sentence into words, preserving punctuation
        const words = sentence.split(/\s+/);
        
        const wordSpans = words.map((word, wIndex) => {
            // Clean word for data attribute but keep display as is
            const cleanWord = word.replace(/[.,!?;:]/g, '').toLowerCase();
            return `<span class="reading-word word-pending" 
                          data-sentence="${sIndex}" 
                          data-word-index="${wIndex}"
                          data-word="${cleanWord}">${word}</span>`;
        }).join(' ');
        
        return `<p class="reading-sentence" data-sentence="${sIndex}">${wordSpans}</p>`;
    }).join('');

    elements.text.innerHTML = html;

    // Store sentence boundaries for other modules
    window.__readingSentences = sentences;
}

/**
 * Extract sentences from text
 * @param {string} text - Raw text
 * @returns {Array} Array of sentences
 */
function extractSentences(text) {
    if (!text) return [];

    // Clean the text
    const clean = text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Split by sentence boundaries (., !, ? followed by space)
    const sentences = clean.split(/(?<=[.!?])\s+/);
    
    // Filter out empty sentences
    return sentences.filter(s => s.trim().length > 0);
}

/**
 * Evaluate reading by sending to feedback module
 * @param {string} transcript - Student's speech
 */
async function evaluateReading(transcript) {
    if (!state.currentLesson) {
        handleError('No lesson loaded');
        return;
    }

    try {
        await feedback.evaluate(
            transcript,
            state.currentLesson.content,
            state.currentLesson.id
        );
    } catch (error) {
        console.error('Evaluation failed:', error);
    }
}

/**
 * Update score display
 * @param {number} score - Score value
 */
function updateScoreDisplay(score) {
    if (!elements.scoreDisplay) return;

    let colorClass = 'score-low';
    if (score >= 80) colorClass = 'score-high';
    else if (score >= 60) colorClass = 'score-medium';

    elements.scoreDisplay.innerHTML = `
        <div class="score-display ${colorClass}">
            <span class="score-value">${Math.round(score)}%</span>
            <span class="score-label">Pronunciation Score</span>
        </div>
    `;
}

/**
 * Update UI based on current module states
 */
function updateUIBasedOnState() {
    // This can be extended based on needs
}

/**
 * Show offline indicator
 * @param {boolean} show - Whether to show
 */
function showOfflineIndicator(show) {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        if (show) {
            indicator.classList.remove('d-none');
        } else {
            indicator.classList.add('d-none');
        }
    }
}

/**
 * Set up global event listeners
 */
function setupEventListeners() {
    // Listen for recording complete to trigger evaluation
    document.addEventListener('recording-complete', (event) => {
        if (state.currentLesson && event.detail?.transcript) {
            evaluateReading(event.detail.transcript);
        }
    });

    // Listen for errors from modules
    document.addEventListener('recognition-error', (event) => {
        handleError('Speech recognition error', event.detail);
    });

    document.addEventListener('feedback-error', (event) => {
        handleError('Feedback error', event.detail);
    });

    // Handle visibility change (pause when tab hidden)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (textReader.isReading && !textReader.isPaused) {
                textReader.pause();
            }
        }
    });

    // Handle before unload
    window.addEventListener('beforeunload', () => {
        destroyApp();
    });
}

/**
 * Show app loading indicator
 */
function showAppLoading() {
    if (!elements.loadingIndicator) return;

    elements.loadingIndicator.innerHTML = `
        <div class="app-loading">
            <div class="spinner"></div>
            <div class="loading-text">Loading reading lesson...</div>
        </div>
    `;
    elements.loadingIndicator.classList.remove('d-none');
}

/**
 * Hide app loading indicator
 */
function hideAppLoading() {
    if (elements.loadingIndicator) {
        elements.loadingIndicator.classList.add('d-none');
        elements.loadingIndicator.innerHTML = '';
    }
}

/**
 * Handle error
 * @param {string} message - User-friendly message
 * @param {any} error - Error details
 */
/**
 * Handle error - shows classroom-friendly messages
 * @param {string} message - Technical error message
 * @param {any} error - Error details (optional)
 */
function handleError(message, error = null) {
    console.error('Classroom error:', message, error);

    state.error = { message, details: error };

    // Show classroom-friendly error using UI module
    // The ui.showError function now handles converting technical messages
    ui.showError(
        message,                          // Technical message
        'readingError',                    // Container ID
        () => {                            // Retry callback
            window.location.reload();
        }
    );

    // Hide any loading indicators
    hideAppLoading();

    // Trigger callback for analytics/teachers
    triggerCallback('onError', { message, error });
}

/**
 * Detect mobile device
 * @returns {boolean}
 */
function detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
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
 * Get current app state
 * @returns {Object} App state
 */
export function getAppState() {
    return {
        initialized: state.initialized,
        currentLesson: state.currentLesson ? { ...state.currentLesson } : null,
        isLoading: state.isLoading,
        error: state.error,
        isMobile: state.isMobile,
        modules: { ...state.moduleStatus }
    };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} unsafe - Unsafe string
 * @returns {string} Escaped string
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#047;');
}

/**
 * Destroy app and clean up resources
 */
export function destroyApp() {
    console.log('Destroying reading app...');

    // Destroy modules in reverse order
    if (state.moduleStatus.feedback) {
        feedback.destroy?.();
    }

    if (state.moduleStatus.recognition) {
        recognition.destroy?.();
    }

    if (state.moduleStatus.highlight) {
        highlighting.destroy?.();
    }

    if (state.moduleStatus.text) {
        textReader.stop?.();
    }

    // Clear cache
    lessonCache.clear();

    // Reset state
    state.initialized = false;
    state.currentLesson = null;
    state.moduleStatus = {
        text: false,
        highlight: false,
        recognition: false,
        feedback: false,
        ui: false
    };

    console.log('Reading app destroyed');
}

/**
 * Get public API
 * @returns {Object} Public methods
 */
function getPublicAPI() {
    return {
        init: initApp,
        loadLesson: loadLesson,
        getState: getAppState,
        destroy: destroyApp
    };
}

// Auto-initialize if data attribute present
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const appElement = document.getElementById('reading-app');
        if (appElement && appElement.dataset.autoInit !== 'false') {
            initApp();
        }
    });
} else {
    const appElement = document.getElementById('reading-app');
    if (appElement && appElement.dataset.autoInit !== 'false') {
        initApp();
    }
}

// ===== NO EXPORT DEFAULT HERE =====
// The file ends here. Nothing after this line.