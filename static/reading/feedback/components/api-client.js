// static/reading/feedback/components/api-client.js
// PURPOSE: API communication for feedback with retry, caching, and offline support

import { 
    getCSRFToken, 
    getUserFriendlyError, 
    generateRequestId,
    shouldRetry,
    getRetryDelay,
    formatTranscriptForAPI
} from '../utils/feedback-utils.js';

let apiEndpoint = '/reading/api/feedback/';
let timeout = 10000;
let maxRetries = 3;
let currentController = null;
let pendingRequests = new Map();

// Cache integration
let cache = null;

/**
 * Initialize API client
 * @param {Object} options - Configuration options
 */
export function initClient(options = {}) {
    if (options.apiEndpoint) apiEndpoint = options.apiEndpoint;
    if (options.timeout) timeout = options.timeout;
    if (options.maxRetries) maxRetries = options.maxRetries;
    if (options.cache) cache = options.cache;
    
    console.log('🌐 API client initialized', { endpoint: apiEndpoint, timeout });
}

/**
 * Make API request with retry and cancellation
 * @param {Object} body - Request body
 * @param {Object} options - Request options
 * @param {AbortSignal} options.signal - Abort signal
 * @param {number} options.retryCount - Current retry count
 * @param {boolean} options.useCache - Whether to check cache
 * @param {string} options.requestId - Request ID for tracking
 * @returns {Promise<Object>} Normalized response
 */
export async function makeRequest(body, options = {}) {
    const {
        signal: externalSignal,
        retryCount = 0,
        useCache = true,
        requestId = generateRequestId()
    } = options;

    console.log(`🌐 [api-client][${requestId}] makeRequest START`, { endpoint: apiEndpoint, retryCount });

    // Check cache first if enabled
    if (useCache && cache) {
        const cacheKey = getCacheKey(body);
        const cached = cache.getCached(cacheKey);
        if (cached) {
            console.log(`📦 [api-client][${requestId}] Cache hit`);
            return {
                ...cached,
                fromCache: true,
                requestId
            };
        }
    }

    // Cancel previous request for same lesson/transcript
    const requestKey = getRequestKey(body);
    if (pendingRequests.has(requestKey)) {
        const previous = pendingRequests.get(requestKey);
        previous.controller.abort();
        console.log(`🔄 [api-client][${requestId}] Cancelled previous request`);
    }

    // Create new abort controller
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Store for potential cancellation
    pendingRequests.set(requestKey, { controller, requestId });

    // Handle external signal
    if (externalSignal) {
        externalSignal.addEventListener('abort', () => {
            controller.abort();
            pendingRequests.delete(requestKey);
        });
    }

    // Set timeout
    const timeoutId = setTimeout(() => {
        controller.abort();
        console.log(`⏰ [api-client][${requestId}] Request timeout after ${timeout}ms`);
    }, timeout);

    try {
        const csrfToken = getCSRFToken();
        console.log(`🔑 [api-client][${requestId}] CSRF token:`, csrfToken ? 'found' : 'missing');

        // Format body for API
        const apiBody = formatRequestBody(body);

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
                'X-Request-ID': requestId
            },
            body: JSON.stringify(apiBody),
            signal,
            credentials: 'same-origin'
        });

        clearTimeout(timeoutId);
        pendingRequests.delete(requestKey);

        console.log(`📥 [api-client][${requestId}] response status:`, response.status);

        if (!response.ok) {
            const error = await handleErrorResponse(response, requestId);
            
            // Check if retryable
            if (shouldRetry(error) && retryCount < maxRetries) {
                const delay = getRetryDelay(retryCount);
                console.log(`🔄 [api-client][${requestId}] Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return makeRequest(body, {
                    ...options,
                    retryCount: retryCount + 1,
                    signal: externalSignal
                });
            }
            
            throw error;
        }

        const data = await response.json();
        console.log(`📦 [api-client][${requestId}] response data:`, data);
        
        const normalized = normalizeResponse(data, requestId);
        
        // Cache the response
        if (useCache && cache) {
            const cacheKey = getCacheKey(body);
            cache.setCached(cacheKey, normalized);
            console.log(`📦 [api-client][${requestId}] Cached response`);
        }
        
        return normalized;

    } catch (error) {
        clearTimeout(timeoutId);
        pendingRequests.delete(requestKey);
        
        // Handle abort errors gracefully
        if (error.name === 'AbortError') {
            console.log(`⏹️ [api-client][${requestId}] Request aborted`);
            throw new Error('Request cancelled', { cause: { status: 499 } });
        }
        
        console.error(`❌ [api-client][${requestId}] Request failed:`, error);
        
        // Enhance error with user-friendly message
        error.userMessage = getUserFriendlyError(error);
        error.requestId = requestId;
        
        throw error;
    }
}

/**
 * Format request body for API
 * @param {Object} body - Original body
 * @returns {Object} Formatted body
 */
function formatRequestBody(body) {
    return {
        transcript: formatTranscriptForAPI(body.transcript || ''),
        expected_text: body.expected_text || '',
        lesson_id: body.lesson_id,
        language: body.language || 'en',
        preserve_arabic_honorifics: body.preserve_arabic_honorifics !== false,
        include_phonetic: body.include_phonetic || false,
        timestamp: Date.now()
    };
}

/**
 * Handle error response
 * @param {Response} response - Fetch response
 * @param {string} requestId - Request ID
 * @returns {Promise<Error>} Enhanced error
 */
async function handleErrorResponse(response, requestId) {
    let errorMessage = `Server error: ${response.status}`;
    let errorData = {};
    
    try {
        errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {}
    
    const error = new Error(errorMessage, { cause: { status: response.status } });
    error.data = errorData;
    error.requestId = requestId;
    
    return error;
}

/**
 * Normalize API response
 * @param {Object} data - Raw response
 * @param {string} requestId - Request ID
 * @returns {Object} Normalized response
 */
function normalizeResponse(data, requestId) {
    return {
        score: parseFloat(data.score) || 0,
        feedback: data.feedback || '',
        mispronounced: Array.isArray(data.mispronounced) ? data.mispronounced : [],
        phonetic_errors: data.phonetic_errors || [],
        attempt_id: data.attempt_id,
        word_count: data.word_count || 0,
        problem_count: data.problem_count || 0,
        analysis: data.analysis || null,
        metadata: {
            timestamp: Date.now(),
            requestId,
            serverVersion: data.version || '1.0',
            processingTime: data.processing_time || 0
        },
        fromCache: false
    };
}

/**
 * Get cache key from request body
 * @param {Object} body - Request body
 * @returns {string} Cache key
 */
function getCacheKey(body) {
    const transcript = formatTranscriptForAPI(body.transcript || '');
    const expected = body.expected_text || '';
    const lessonId = body.lesson_id || 'unknown';
    return `api_${lessonId}_${transcript.substring(0, 50)}`;
}

/**
 * Get request key for cancellation
 * @param {Object} body - Request body
 * @returns {string} Request key
 */
function getRequestKey(body) {
    const transcript = formatTranscriptForAPI(body.transcript || '');
    const lessonId = body.lesson_id || 'unknown';
    return `${lessonId}_${transcript.substring(0, 30)}`;
}

/**
 * Cancel all pending requests
 */
export function cancelAllRequests() {
    pendingRequests.forEach(({ controller }) => {
        controller.abort();
    });
    pendingRequests.clear();
    console.log('🌐 All pending requests cancelled');
}

/**
 * Cancel request for specific lesson
 * @param {string} lessonId - Lesson ID
 */
export function cancelLessonRequests(lessonId) {
    const toDelete = [];
    pendingRequests.forEach((value, key) => {
        if (key.startsWith(lessonId)) {
            value.controller.abort();
            toDelete.push(key);
        }
    });
    toDelete.forEach(key => pendingRequests.delete(key));
    console.log(`🌐 Cancelled requests for lesson ${lessonId}`);
}

/**
 * Check if there are pending requests
 * @returns {boolean}
 */
export function hasPendingRequests() {
    return pendingRequests.size > 0;
}

/**
 * Get pending request count
 * @returns {number}
 */
export function getPendingRequestCount() {
    return pendingRequests.size;
}

export default {
    initClient,
    makeRequest,
    cancelAllRequests,
    cancelLessonRequests,
    hasPendingRequests,
    getPendingRequestCount
};