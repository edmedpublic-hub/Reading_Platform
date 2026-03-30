// static/reading/feedback/index.js
// PURPOSE: Public API for feedback module - coordinates components and UI

import { initClient, makeRequest, cancelAllRequests } from './components/api-client.js';
import { initCache, getCached, setCached, clearCache, getCacheStats } from './components/cache.js';
import { initOfflineQueue, addToQueue, isOnlineStatus, getQueueLength, getQueueStats, retryFailed } from './components/offline-queue.js';
import { 
    getCSRFToken, 
    generateCacheKey, 
    getFeedbackCacheKey,
    shouldUseLocalAnalysis,
    shouldRetry,
    getUserFriendlyError,
    generateRequestId,
    formatTranscriptForAPI,
    isValidTranscript,
    getRetryDelay
} from './utils/feedback-utils.js';

// Import analysis engine for local fallback
import { analyzeReading } from '../reading.analysis.js';

// Module state
let initialized = false;
let pendingRequests = new Map();
let retryCount = 0;
let maxRetries = 3;
let callbacks = {};
let currentLessonId = null;
let currentLanguage = 'en';

let config = {
    minTextLength: 3,
    maxTextLength: 5000,
    autoRetry: true,
    storeHistory: true,
    maxHistoryItems: 50,
    useLocalAnalysis: true,      // Fallback to local when offline/API fails
    preferLocalForShort: true,   // Use local for short texts
    maxLocalLength: 500,         // Max chars for local analysis
    language: 'en'
};

// DOM elements (for direct manipulation only as fallback)
let elementIds = {
    scoreDisplay: 'readingScore',
    feedbackText: 'readingDetails',
    problemWords: 'problemWordsContainer',  // Changed to match UI module
    loadingIndicator: 'feedbackLoading',
    errorContainer: 'readingError'
};

// History
let feedbackHistory = [];

/**
 * Initialize feedback module
 * @param {Object} options - Configuration options
 * @returns {Object} Public API
 */
export function init(options = {}) {
    if (initialized) return getPublicAPI();
    
    const {
        apiEndpoint,
        elementIds: userElementIds = {},
        callbacks: userCallbacks = {},
        config: userConfig = {},
        maxRetries: userMaxRetries,
        cacheEnabled,
        cacheTTL,
        lessonId,
        language = 'en'
    } = options;
    
    // Store current context
    currentLessonId = lessonId || null;
    currentLanguage = language;
    
    // Merge config
    config = { ...config, ...userConfig, language };
    
    // Merge element IDs
    elementIds = { ...elementIds, ...userElementIds };
    
    // Set max retries
    if (userMaxRetries) maxRetries = userMaxRetries;
    
    // Store callbacks
    if (userCallbacks) callbacks = { ...callbacks, ...userCallbacks };
    
    // Initialize API client
    if (apiEndpoint) {
        initClient({ 
            apiEndpoint, 
            maxRetries,
            cache: { getCached, setCached } // Pass cache methods
        });
    }
    
    // Initialize cache
    initCache({
        cacheEnabled,
        cacheTTL,
        lessonId: currentLessonId
    });
    
    // Initialize offline queue
    initOfflineQueue({
        maxQueueSize: 100,
        maxRetries: 3,
        callbacks: {
            onItemProcessed: handleQueuedItemProcessed,
            onQueueEmpty: handleQueueEmpty,
            onQueueError: handleQueueError
        }
    });
    
    // Set up event listeners for queue processing
    setupQueueListeners();
    
    // Load history
    if (config.storeHistory) loadHistory();
    
    initialized = true;
    console.log('📝 Feedback module ready with config:', config);
    
    return getPublicAPI();
}

/**
 * Set up event listeners for offline queue
 */
function setupQueueListeners() {
    document.addEventListener('process-queued-item', async (event) => {
        const { item, id, resolve } = event.detail;
        
        try {
            // Process the queued item
            const result = await evaluate(
                item.studentText,
                item.expectedText,
                item.lessonId,
                { fromQueue: true }
            );
            
            if (result) {
                resolve(true);
                
                // Dispatch event for UI
                document.dispatchEvent(new CustomEvent('display-feedback', {
                    detail: { 
                        analysis: result,
                        containerId: elementIds.problemWords,
                        transcript: item.studentText
                    }
                }));
            } else {
                resolve(false);
            }
        } catch (error) {
            console.error('Failed to process queued item:', error);
            resolve(false);
        }
    });
}

/**
 * Handle queued item processed
 */
function handleQueuedItemProcessed(item) {
    console.log('✅ Queued item processed:', item.id);
    triggerCallback('onQueuedProcessed', { item });
}

/**
 * Handle queue empty
 */
function handleQueueEmpty() {
    console.log('📋 Queue empty');
    triggerCallback('onQueueEmpty', {});
}

/**
 * Handle queue error
 */
function handleQueueError(error) {
    console.error('Queue error:', error);
    triggerCallback('onQueueError', { error });
}

/**
 * Evaluate speech against expected text
 * @param {string} studentText - What the user said
 * @param {string} expectedText - Expected text
 * @param {string} lessonId - Lesson ID
 * @param {Object} options - Evaluation options
 * @returns {Promise<Object>} Analysis result
 */
export async function evaluate(studentText, expectedText, lessonId = null, options = {}) {
    const {
        fromQueue = false,
        forceLocal = false,
        skipCache = false,
        language = currentLanguage
    } = options;

    const requestId = generateRequestId();
    const effectiveLessonId = lessonId || currentLessonId;

    console.log(`📢 [feedback][${requestId}] evaluate CALLED`, { 
        studentText: studentText?.substring(0, 30) + '...', 
        expectedText: expectedText?.substring(0, 30) + '...', 
        lessonId: effectiveLessonId 
    });
    
    // Validate inputs
    if (!validateInputs(studentText, expectedText, language)) {
        console.log(`❌ [feedback][${requestId}] validation failed`);
        return null;
    }
    
    // Create cache key
    const cacheKey = getFeedbackCacheKey(effectiveLessonId || 'global', studentText);
    console.log(`🔑 [feedback][${requestId}] cacheKey:`, cacheKey);
    
    // Check cache (unless skipped)
    if (!skipCache) {
        const cached = getCached(cacheKey);
        if (cached) {
            console.log(`💾 [feedback][${requestId}] using cached result`);
            
            // Dispatch for UI
            dispatchFeedbackForDisplay(cached, studentText);
            
            return cached;
        }
    }
    
    // Check for duplicate request
    if (pendingRequests.has(cacheKey) && !fromQueue) {
        console.log(`🔄 [feedback][${requestId}] duplicate request, returning existing promise`);
        return pendingRequests.get(cacheKey);
    }
    
    // Decide whether to use local analysis or API
    const useLocal = shouldUseLocalAnalysis({
        forceLocal,
        preferLocal: config.preferLocalForShort,
        transcriptLength: studentText.length,
        maxLocalLength: config.maxLocalLength
    });
    
    triggerCallback('onStart', { studentText, expectedText, lessonId: effectiveLessonId, requestId });
    
    // Show loading only if not from queue
    if (!fromQueue) {
        dispatchLoading(true);
    }
    
    let result;
    
    if (useLocal) {
        // Use local analysis engine
        console.log(`🏠 [feedback][${requestId}] using local analysis`);
        result = await performLocalAnalysis(studentText, expectedText, language);
    } else {
        // Use API
        result = await performAPIAnalysis(studentText, expectedText, effectiveLessonId, cacheKey, requestId);
    }
    
    // Handle result
    if (result) {
        // Cache the result
        setCached(cacheKey, result);
        
        // Dispatch for UI (unless from queue, where UI already handled)
        if (!fromQueue) {
            dispatchFeedbackForDisplay(result, studentText);
        }
        
        // Store in history
        if (config.storeHistory) {
            addToHistory({
                timestamp: Date.now(),
                studentText: studentText.substring(0, 100),
                expectedText: expectedText.substring(0, 100),
                lessonId: effectiveLessonId,
                result,
                requestId
            });
        }
        
        triggerCallback('onSuccess', { result, requestId });
        
        document.dispatchEvent(new CustomEvent('feedback-success', {
            detail: { result, lessonId: effectiveLessonId, requestId, timestamp: Date.now() }
        }));
    }
    
    // Hide loading
    if (!fromQueue) {
        dispatchLoading(false);
    }
    
    triggerCallback('onComplete', { requestId });
    
    return result;
}

/**
 * Perform local analysis using reading.analysis.js
 */
async function performLocalAnalysis(studentText, expectedText, language) {
    console.log('🏠 Performing local analysis');
    
    try {
        const analysis = analyzeReading(studentText, expectedText, {
            ignorePunctuation: true,
            ignoreCase: true,
            preserveArabicHonorifics: true
        });
        
        // Format to match API response structure
        return {
            score: analysis.stats.weightedScore || analysis.stats.accuracy || 0,
            feedback: getLocalFeedbackMessage(analysis, language),
            mispronounced: analysis.incorrect.map(i => ({
                word: i.expected,
                heard: i.heard,
                status: 'incorrect',
                confidence: i.confidence
            })),
            missing: analysis.missing.map(m => ({
                word: m.word,
                status: 'missing'
            })),
            extra: analysis.extra.map(e => ({
                word: e.word,
                status: 'extra'
            })),
            correct: analysis.correct.map(c => ({
                word: c.word,
                status: 'correct'
            })),
            word_count: analysis.stats.totalExpected,
            problem_count: analysis.stats.incorrect + analysis.stats.missing + analysis.stats.extra,
            analysis, // Full analysis for UI
            metadata: {
                timestamp: Date.now(),
                source: 'local',
                language,
                version: '2.1.0'
            },
            fromCache: false
        };
    } catch (error) {
        console.error('Local analysis failed:', error);
        throw new Error('Local analysis failed', { cause: error });
    }
}

/**
 * Get user-friendly feedback message from local analysis
 */
function getLocalFeedbackMessage(analysis, language) {
    const stats = analysis.stats;
    const totalWords = stats.totalExpected;
    const correct = stats.correct;
    
    if (totalWords === 0) return language === 'ar' ? 'لم يتم اكتشاف كلام' : 'No speech detected';
    
    if (correct === totalWords) {
        return language === 'ar' ? 'ممتاز! جميع الكلمات صحيحة' : 'Excellent! All words correct';
    }
    
    if (correct >= totalWords * 0.8) {
        return language === 'ar' ? 'جيد جداً! معظم الكلمات صحيحة' : 'Very good! Most words correct';
    }
    
    if (correct >= totalWords * 0.5) {
        return language === 'ar' ? 'جيد، استمر في الممارسة' : 'Good, keep practicing';
    }
    
    return language === 'ar' ? 'حاول مرة أخرى، ركز على الكلمات الصعبة' : 'Try again, focus on problem words';
}

/**
 * Perform API analysis
 */
async function performAPIAnalysis(studentText, expectedText, lessonId, cacheKey, requestId) {
    // Check online status
    if (!isOnlineStatus()) {
        console.log(`📴 [feedback][${requestId}] offline, queueing`);
        return handleOffline(studentText, expectedText, lessonId, cacheKey, requestId);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const requestBody = {
        transcript: formatTranscriptForAPI(studentText),
        expected_text: expectedText,
        lesson_id: lessonId,
        language: currentLanguage,
        preserve_arabic_honorifics: true
    };
    
    console.log(`📤 [feedback][${requestId}] making API request:`, requestBody);
    
    const requestPromise = makeRequestWithRetry(requestBody, controller.signal, cacheKey, requestId);
    pendingRequests.set(cacheKey, requestPromise);
    
    try {
        const result = await requestPromise;
        clearTimeout(timeoutId);
        return result;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        // If API fails and local fallback is enabled, try local
        if (config.useLocalAnalysis) {
            console.log(`⚠️ [feedback][${requestId}] API failed, falling back to local`);
            return performLocalAnalysis(studentText, expectedText, currentLanguage);
        }
        
        throw error;
        
    } finally {
        pendingRequests.delete(cacheKey);
    }
}

/**
 * Make API request with retry
 */
async function makeRequestWithRetry(body, signal, cacheKey, requestId, attempt = 1) {
    try {
        return await makeRequest(body, { signal, requestId, useCache: true });
    } catch (error) {
        if (config.autoRetry && shouldRetry(error) && attempt <= maxRetries) {
            console.log(`🔄 [feedback][${requestId}] Retrying (${attempt}/${maxRetries})...`);
            const delay = getRetryDelay(attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
            return makeRequestWithRetry(body, signal, cacheKey, requestId, attempt + 1);
        }
        throw error;
    }
}

/**
 * Dispatch feedback for UI module to display
 */
function dispatchFeedbackForDisplay(result, transcript) {
    document.dispatchEvent(new CustomEvent('display-feedback', {
        detail: { 
            analysis: result,
            containerId: elementIds.problemWords,
            transcript
        }
    }));
}

/**
 * Dispatch loading state for UI
 */
function dispatchLoading(show) {
    document.dispatchEvent(new CustomEvent('feedback-loading', {
        detail: { show }
    }));
}

/**
 * Validate inputs
 */
function validateInputs(studentText, expectedText, language) {
    if (!isValidTranscript(studentText, config.minTextLength)) {
        const message = language === 'ar' 
            ? 'لم يتم اكتشاف كلام. حاول مرة أخرى.'
            : 'No speech detected. Please try again.';
        dispatchError(message);
        return false;
    }
    
    if (!expectedText || typeof expectedText !== 'string') {
        const message = language === 'ar'
            ? 'لا يوجد نص مرجعي.'
            : 'No reference text available.';
        dispatchError(message);
        return false;
    }
    
    if (studentText.length > config.maxTextLength) {
        const message = language === 'ar'
            ? `النص طويل جداً (الحد الأقصى ${config.maxTextLength} حرف).`
            : `Text too long (maximum ${config.maxTextLength} characters).`;
        dispatchError(message);
        return false;
    }
    
    return true;
}

/**
 * Dispatch error for UI
 */
function dispatchError(message) {
    document.dispatchEvent(new CustomEvent('feedback-error', {
        detail: { message }
    }));
}

/**
 * Handle offline scenario
 */
async function handleOffline(studentText, expectedText, lessonId, cacheKey, requestId) {
    console.log(`📴 [feedback][${requestId}] Offline, queueing request`);
    
    const queuedItem = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        studentText,
        expectedText,
        lessonId,
        cacheKey,
        timestamp: Date.now(),
        requestId
    };
    
    const queueLength = addToQueue(queuedItem, { priority: 5 });
    
    triggerCallback('onOffline', { queuedItem, queueLength });
    
    // If local analysis is enabled, return immediate result
    if (config.useLocalAnalysis) {
        console.log(`🏠 [feedback][${requestId}] Using local analysis while offline`);
        return performLocalAnalysis(studentText, expectedText, currentLanguage);
    }
    
    // Return offline placeholder
    return {
        score: 0,
        feedback: currentLanguage === 'ar' 
            ? 'غير متصل - في انتظار الاتصال' 
            : 'Offline - waiting for connection',
        mispronounced: [],
        metadata: { 
            timestamp: Date.now(), 
            offline: true, 
            queued: true,
            queuePosition: queueLength
        }
    };
}

/**
 * Add to history
 */
function addToHistory(entry) {
    feedbackHistory.unshift(entry);
    if (feedbackHistory.length > config.maxHistoryItems) feedbackHistory.pop();
    try {
        localStorage.setItem('feedbackHistory', JSON.stringify(feedbackHistory));
    } catch (error) {
        console.warn('Could not save feedback history:', error);
    }
}

/**
 * Load history from localStorage
 */
function loadHistory() {
    try {
        const saved = localStorage.getItem('feedbackHistory');
        if (saved) feedbackHistory = JSON.parse(saved);
    } catch (error) {
        console.warn('Could not load feedback history:', error);
    }
}

/**
 * Get history
 */
export function getHistory(limit = 10) {
    return feedbackHistory.slice(0, limit);
}

/**
 * Clear history
 */
export function clearHistory() {
    feedbackHistory = [];
    try {
        localStorage.removeItem('feedbackHistory');
    } catch (error) {
        console.warn('Could not clear history:', error);
    }
}

/**
 * Trigger callback
 */
function triggerCallback(name, data) {
    if (callbacks[name] && typeof callbacks[name] === 'function') {
        try {
            callbacks[name](data);
        } catch (error) {
            console.error(`Callback ${name} failed:`, error);
        }
    }
}

/**
 * Get cache statistics
 */
export function getStats() {
    return {
        cache: getCacheStats(),
        queue: getQueueStats(),
        history: feedbackHistory.length
    };
}

/**
 * Retry failed queue items
 */
export function retryQueue() {
    retryFailed();
}

/**
 * Destroy module
 */
export function destroy() {
    cancelAllRequests();
    clearCache();
    initialized = false;
    console.log('📝 Feedback module destroyed');
}

/**
 * Get public API
 */
function getPublicAPI() {
    return {
        init,
        evaluate,
        getHistory,
        clearHistory,
        getStats,
        retryQueue,
        destroy
    };
}

export default getPublicAPI();