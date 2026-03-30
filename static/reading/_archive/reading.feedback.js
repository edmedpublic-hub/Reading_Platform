// static/reading/reading.feedback.js
// PURPOSE: API communication with your Django backend
// DEPENDENCIES: None

let state = {
    initialized: false, 
    apiEndpoint: '/reading/api/feedback/',  // Make sure this matches your URL
    timeout: 10000, 
    maxRetries: 2, 
    retryDelay: 1000,
    cacheEnabled: true, 
    cacheTTL: 5 * 60 * 1000,
    pendingRequests: new Map(), 
    cache: new Map(),
    offlineQueue: [], 
    isOnline: navigator.onLine,
    elementIds: {
        scoreDisplay: 'readingScore',
        feedbackText: 'readingDetails',  // Changed to match your template
        problemWords: 'problemWords',
        loadingIndicator: 'feedbackLoading',
        errorContainer: 'readingError'    // Changed to match your template
    },
    callbacks: {
        onStart: null, 
        onSuccess: null, 
        onError: null, 
        onComplete: null, 
        onOffline: null
    },
    config: {
        minTextLength: 10, 
        maxTextLength: 5000, 
        showDetailedFeedback: true, 
        autoRetry: true, 
        storeHistory: true, 
        maxHistoryItems: 50
    }
};
let elements = {};
let feedbackHistory = [];

export function initFeedback(options = {}) {
    if (state.initialized) return getPublicAPI();
    mergeOptions(options);
    getElements();
    setupEventListeners();
    if (state.config.storeHistory) loadHistory();
    state.initialized = true;
    return getPublicAPI();
}

function mergeOptions(options) {
    if (options.apiEndpoint) state.apiEndpoint = options.apiEndpoint;
    if (options.elementIds) state.elementIds = { ...state.elementIds, ...options.elementIds };
    if (options.callbacks) state.callbacks = { ...state.callbacks, ...options.callbacks };
    if (options.config) state.config = { ...state.config, ...options.config };
    if (options.timeout) state.timeout = options.timeout;
    if (options.maxRetries) state.maxRetries = options.maxRetries;
    if (options.cacheEnabled !== undefined) state.cacheEnabled = options.cacheEnabled;
    if (options.cacheTTL) state.cacheTTL = options.cacheTTL;
}

function getElements() {
    elements = {
        scoreDisplay: document.getElementById(state.elementIds.scoreDisplay),
        feedbackText: document.getElementById(state.elementIds.feedbackText),
        problemWords: document.getElementById(state.elementIds.problemWords),
        loadingIndicator: document.getElementById(state.elementIds.loadingIndicator),
        errorContainer: document.getElementById(state.elementIds.errorContainer)
    };
}

function setupEventListeners() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('request-evaluation', handleEvaluationRequest);
}

function handleOnline() { 
    state.isOnline = true; 
    processOfflineQueue(); 
    showOfflineIndicator(false); 
}

function handleOffline() { 
    state.isOnline = false; 
    showOfflineIndicator(true); 
    triggerCallback('onOffline', {}); 
}

function handleEvaluationRequest(event) {
    const { spoken, expected, lessonId } = event.detail;
    if (spoken && expected) evaluateReading(spoken, expected, lessonId);
}

export async function evaluateReading(studentText, expectedText, lessonId = null, options = {}) {
    if (!validateInputs(studentText, expectedText)) return null;
    
    const cacheKey = createCacheKey(studentText, expectedText, lessonId);
    
    if (state.cacheEnabled) { 
        const cached = checkCache(cacheKey); 
        if (cached) { 
            displayFeedback(cached); 
            return cached; 
        } 
    }
    
    if (state.pendingRequests.has(cacheKey)) return state.pendingRequests.get(cacheKey);
    
    if (!state.isOnline) return handleOfflineEvaluation(studentText, expectedText, lessonId, cacheKey);
    
    triggerCallback('onStart', { studentText, expectedText, lessonId });
    showLoading(true);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), state.timeout);
    
    // IMPORTANT FIX: Match backend field names exactly
    const requestBody = { 
        spoken: studentText,      // Backend expects 'spoken'
        expected: expectedText,   // Backend expects 'expected'
        lesson_id: lessonId       // Backend expects 'lesson_id'
    };
    
    const requestPromise = makeRequest(requestBody, controller.signal, cacheKey);
    state.pendingRequests.set(cacheKey, requestPromise);
    
    try {
        const result = await requestPromise;
        clearTimeout(timeoutId);
        
        if (state.cacheEnabled && result) cacheResult(cacheKey, result);
        displayFeedback(result);
        
        if (state.config.storeHistory) {
            addToHistory({ 
                timestamp: Date.now(), 
                studentText: studentText.substring(0, 100), 
                expectedText: expectedText.substring(0, 100), 
                lessonId, 
                result 
            });
        }
        
        triggerCallback('onSuccess', result);
        document.dispatchEvent(new CustomEvent('feedback-success', { 
            detail: { result, lessonId, timestamp: Date.now() } 
        }));
        
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        return handleRequestError(error, studentText, expectedText, lessonId, cacheKey, options);
    } finally {
        state.pendingRequests.delete(cacheKey);
        showLoading(false);
        triggerCallback('onComplete', {});
    }
}

function validateInputs(studentText, expectedText) {
    if (!studentText || typeof studentText !== 'string') { 
        showError('No speech detected. Please try again.'); 
        return false; 
    }
    if (!expectedText || typeof expectedText !== 'string') { 
        showError('No reference text available.'); 
        return false; 
    }
    if (studentText.length < state.config.minTextLength) { 
        showError(`Please speak a bit more (minimum ${state.config.minTextLength} characters).`); 
        return false; 
    }
    if (studentText.length > state.config.maxTextLength) { 
        showError(`Text too long (maximum ${state.config.maxTextLength} characters).`); 
        return false; 
    }
    return true;
}

function sanitizeText(text) { 
    return text.trim().replace(/\s+/g, ' ').substring(0, state.config.maxTextLength); 
}

function createCacheKey(studentText, expectedText, lessonId) {
    const studentHash = hashString(studentText.substring(0, 100));
    const expectedHash = hashString(expectedText.substring(0, 100));
    return `${lessonId || 'global'}:${studentHash}:${expectedHash}`;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { 
        hash = ((hash << 5) - hash) + str.charCodeAt(i); 
        hash = hash & hash; 
    }
    return Math.abs(hash).toString(36);
}

function checkCache(key) {
    if (!state.cacheEnabled) return null;
    const cached = state.cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > state.cacheTTL) { 
        state.cache.delete(key); 
        return null; 
    }
    return cached.data;
}

function cacheResult(key, data) {
    if (!state.cacheEnabled) return;
    state.cache.set(key, { data, timestamp: Date.now() });
    if (state.cache.size > 100) { 
        const oldestKey = state.cache.keys().next().value; 
        state.cache.delete(oldestKey); 
    }
}

export function clearCache(key = null) { 
    if (key) state.cache.delete(key); 
    else state.cache.clear(); 
}

async function makeRequest(body, signal, cacheKey) {
    const csrfToken = getCSRFToken();
    
    const response = await fetch(state.apiEndpoint, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'X-CSRFToken': csrfToken, 
            'X-Requested-With': 'XMLHttpRequest' 
        },
        body: JSON.stringify(body), 
        signal, 
        credentials: 'same-origin'
    });
    
    if (!response.ok) {
        let errorMessage = `Server error: ${response.status}`;
        try { 
            const errorData = await response.json(); 
            errorMessage = errorData.error || errorData.message || errorMessage; 
        } catch {}
        throw new Error(errorMessage, { cause: { status: response.status } });
    }
    
    const data = await response.json();
    
    // Validate response structure (matches your backend)
    if (!validateResponse(data)) throw new Error('Invalid response format from server');
    
    return normalizeResponse(data);
}

function validateResponse(data) {
    // Your backend returns these fields
    const required = ['score', 'feedback'];
    const hasRequired = required.every(field => field in data);
    if (!hasRequired) console.warn('Response missing required fields:', data);
    return hasRequired;
}

function normalizeResponse(data) {
    return {
        score: parseFloat(data.score) || 0, 
        feedback: data.feedback || '',
        mispronounced: Array.isArray(data.mispronounced) ? data.mispronounced : [],
        phonetic_errors: data.phonetic_errors || [],
        attempt_id: data.attempt_id,
        word_count: data.word_count || 0,
        problem_count: data.problem_count || 0,
        metadata: { 
            timestamp: Date.now(), 
            serverVersion: '1.0', 
            processingTime: 0 
        }
    };
}

async function handleOfflineEvaluation(studentText, expectedText, lessonId, cacheKey) {
    console.log('Offline, queuing request');
    const queuedItem = { 
        id: Date.now(), 
        studentText, 
        expectedText, 
        lessonId, 
        cacheKey, 
        timestamp: Date.now() 
    };
    state.offlineQueue.push(queuedItem);
    saveOfflineQueue();
    showOfflineMessage('You are offline. Your response will be evaluated when connection is restored.');
    triggerCallback('onOffline', { queuedItem });
    return { 
        score: 0, 
        feedback: 'Offline - waiting for connection', 
        mispronounced: [], 
        metadata: { timestamp: Date.now(), offline: true, queued: true } 
    };
}

async function processOfflineQueue() {
    if (state.offlineQueue.length === 0) return;
    console.log(`Processing ${state.offlineQueue.length} queued requests`);
    showOfflineMessage(`Processing ${state.offlineQueue.length} queued evaluations...`);
    
    const results = [], failed = [];
    
    for (const item of state.offlineQueue) {
        try { 
            const result = await evaluateReading(
                item.studentText, 
                item.expectedText, 
                item.lessonId
            ); 
            results.push({ item, result }); 
        } catch (error) { 
            console.error('Failed to process queued item:', error); 
            failed.push(item); 
        }
    }
    
    state.offlineQueue = failed;
    saveOfflineQueue();
    
    if (results.length > 0) {
        showOfflineMessage(`Processed ${results.length} evaluations.`, 'success', 3000);
    }
    
    document.dispatchEvent(new CustomEvent('offline-queue-processed', { 
        detail: { processed: results.length, failed: failed.length } 
    }));
}

function saveOfflineQueue() { 
    try { 
        localStorage.setItem('feedbackOfflineQueue', JSON.stringify(state.offlineQueue)); 
    } catch (error) { 
        console.warn('Could not save offline queue:', error); 
    } 
}

function loadOfflineQueue() { 
    try { 
        const saved = localStorage.getItem('feedbackOfflineQueue'); 
        if (saved) state.offlineQueue = JSON.parse(saved); 
    } catch (error) { 
        console.warn('Could not load offline queue:', error); 
    } 
}

async function handleRequestError(error, studentText, expectedText, lessonId, cacheKey, options) {
    console.error('Evaluation request failed:', error);
    
    if (state.config.autoRetry && shouldRetry(error)) {
        state.retryCount = (state.retryCount || 0) + 1;
        if (state.retryCount <= state.maxRetries) {
            console.log(`Retrying (${state.retryCount}/${state.maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, state.retryDelay * state.retryCount));
            return evaluateReading(studentText, expectedText, lessonId, { ...options, retryCount: state.retryCount });
        }
    }
    
    state.retryCount = 0;
    const userMessage = getUserFriendlyError(error);
    showError(userMessage);
    triggerCallback('onError', { error, message: userMessage });
    document.dispatchEvent(new CustomEvent('feedback-error', { 
        detail: { error: userMessage, originalError: error.message } 
    }));
    return null;
}

function shouldRetry(error) {
    if (error.message.includes('network') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) return true;
    if (error.cause?.status >= 500 && error.cause?.status < 600) return true;
    if (error.name === 'AbortError' || error.message.includes('timeout')) return true;
    return false;
}

function getUserFriendlyError(error) {
    const status = error.cause?.status;
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status === 403) return 'Session expired. Please refresh the page.';
    if (status === 400) return 'Invalid input. Please check your text and try again.';
    if (status === 413) return 'Text too long. Please try a shorter passage.';
    if (status === 503 || status === 504) return 'Service temporarily unavailable. Please try again later.';
    if (error.message.includes('network') || error.message.includes('Failed to fetch')) return 'Network error. Please check your connection.';
    if (error.name === 'AbortError' || error.message.includes('timeout')) return 'Request timed out. Please try again.';
    return 'Unable to evaluate pronunciation. Please try again.';
}

function displayFeedback(data) {
    if (!data) return;
    
    // Update score display
    if (elements.scoreDisplay) {
        elements.scoreDisplay.innerHTML = `
            <div class="score-display ${getScoreClass(data.score)}">
                <span class="score-value">${data.score}%</span>
                <span class="score-label">Pronunciation Score</span>
            </div>
        `;
    }
    
    // Update feedback text
    if (elements.feedbackText) {
        elements.feedbackText.textContent = data.feedback || 'No feedback available.';
    }
    
    // Update problem words list
    if (elements.problemWords && state.config.showDetailedFeedback) {
        displayProblemWords(data);
    }
    
    showLoading(false); 
    hideError();
}

function getScoreClass(score) { 
    if (score >= 80) return 'score-high'; 
    if (score >= 60) return 'score-medium'; 
    return 'score-low'; 
}

function displayProblemWords(data) {
    const mispronounced = data.mispronounced || [];
    
    if (mispronounced.length === 0) {
        elements.problemWords.innerHTML = '<p class="text-success">No errors found! Great job!</p>';
        return;
    }
    
    const list = document.createElement('ul'); 
    list.className = 'problem-words-list';
    
    mispronounced.forEach(item => {
        if (item.status === 'correct') return;
        
        const li = document.createElement('li'); 
        li.className = `problem-item ${item.status || 'mispronounced'}`;
        
        if (item.status === 'missing') {
            li.innerHTML = `
                <span class="missing-label">Missing:</span>
                <span class="expected">${escapeHtml(item.word)}</span>
            `;
        } else {
            li.innerHTML = `
                <span class="expected">${escapeHtml(item.word)}</span>
                <span class="arrow">→</span>
                <span class="heard">${escapeHtml(item.heard)}</span>
            `;
        }
        
        list.appendChild(li);
    });
    
    elements.problemWords.innerHTML = ''; 
    elements.problemWords.appendChild(list);
}

function showLoading(show) {
    if (elements.loadingIndicator) {
        if (show) { 
            elements.loadingIndicator.classList.remove('d-none'); 
            elements.loadingIndicator.setAttribute('aria-hidden', 'false'); 
        } else { 
            elements.loadingIndicator.classList.add('d-none'); 
            elements.loadingIndicator.setAttribute('aria-hidden', 'true'); 
        }
    }
}

function showError(message) {
    if (elements.errorContainer) {
        elements.errorContainer.innerHTML = `
            <div class="alert alert-error" role="alert">
                <span class="alert-icon">❌</span>
                <span class="alert-message">${escapeHtml(message)}</span>
                <button class="alert-close" onclick="this.parentElement.style.display='none'">×</button>
            </div>
        `;
        elements.errorContainer.classList.remove('d-none');
    }
    if (elements.feedbackText) elements.feedbackText.textContent = message;
}

function hideError() { 
    if (elements.errorContainer) { 
        elements.errorContainer.classList.add('d-none'); 
        elements.errorContainer.innerHTML = ''; 
    } 
}

function showOfflineMessage(message, type = 'info', timeout = 0) {
    if (elements.errorContainer) {
        const className = type === 'success' ? 'alert-success' : 'alert-info';
        elements.errorContainer.innerHTML = `
            <div class="alert ${className}" role="status">
                <span class="alert-icon">${type === 'success' ? '✅' : '📶'}</span>
                <span class="alert-message">${escapeHtml(message)}</span>
            </div>
        `;
        elements.errorContainer.classList.remove('d-none');
        if (timeout > 0) setTimeout(() => elements.errorContainer.classList.add('d-none'), timeout);
    }
}

function showOfflineIndicator(show) {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) { 
        if (show) indicator.classList.remove('d-none'); 
        else indicator.classList.add('d-none'); 
    }
}

function getCSRFToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith(name + '=')) return cookie.substring(name.length + 1);
    }
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    return metaToken ? metaToken.getAttribute('content') : '';
}

function addToHistory(entry) {
    feedbackHistory.unshift(entry);
    if (feedbackHistory.length > state.config.maxHistoryItems) feedbackHistory.pop();
    try { 
        localStorage.setItem('feedbackHistory', JSON.stringify(feedbackHistory)); 
    } catch (error) { 
        console.warn('Could not save feedback history:', error); 
    }
}

function loadHistory() {
    try { 
        const saved = localStorage.getItem('feedbackHistory'); 
        if (saved) feedbackHistory = JSON.parse(saved); 
    } catch (error) { 
        console.warn('Could not load feedback history:', error); 
    }
}

export function getFeedbackHistory(limit = 10) { 
    return feedbackHistory.slice(0, limit); 
}

export function clearHistory() { 
    feedbackHistory = []; 
    try { 
        localStorage.removeItem('feedbackHistory'); 
    } catch (error) { 
        console.warn('Could not clear history:', error); 
    } 
}

function triggerCallback(name, data) {
    if (state.callbacks[name] && typeof state.callbacks[name] === 'function') {
        try { 
            state.callbacks[name](data); 
        } catch (error) { 
            console.error(`Callback ${name} failed:`, error); 
        }
    }
}

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

export function destroyFeedback() {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('request-evaluation', handleEvaluationRequest);
    state.cache.clear(); 
    state.pendingRequests.clear();
    state.initialized = false;
}

function getPublicAPI() {
    return { 
        init: initFeedback, 
        evaluate: evaluateReading, 
        getHistory: getFeedbackHistory, 
        clearHistory, 
        clearCache, 
        destroy: destroyFeedback 
    };
}

export default getPublicAPI();