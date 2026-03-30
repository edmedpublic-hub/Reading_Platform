// static/reading/feedback/utils/feedback-utils.js
// PURPOSE: Utility functions for feedback module with enhanced features

/**
 * Get CSRF token for Django requests
 * @returns {string} CSRF token
 */
export function getCSRFToken() {
    // Try cookie first (standard Django)
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith(name + '=')) {
            return cookie.substring(name.length + 1);
        }
    }
    
    // Try meta tag (alternative)
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) {
        return metaToken.getAttribute('content');
    }
    
    // Try meta tag with different name
    const csrfMeta = document.querySelector('meta[name="csrf-token"], meta[name="csrfmiddlewaretoken"]');
    return csrfMeta ? csrfMeta.getAttribute('content') : '';
}

/**
 * Generate a more robust hash for cache keys
 * @param {string} str - String to hash
 * @returns {string} Hash
 */
export function generateCacheKey(str) {
    if (!str) return '';
    
    // Simple but more robust hash than the original
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Add timestamp component for uniqueness
    const timestamp = Date.now().toString(36);
    const hashStr = Math.abs(hash).toString(36).padStart(8, '0');
    
    return `${hashStr}-${timestamp}`;
}

/**
 * Generate feedback cache key from lesson ID and transcript
 * @param {string|number} lessonId - Lesson identifier
 * @param {string} transcript - User's speech transcript
 * @returns {string} Cache key
 */
export function getFeedbackCacheKey(lessonId, transcript) {
    if (!lessonId || !transcript) return '';
    
    const normalizedTranscript = transcript.trim().toLowerCase().replace(/\s+/g, ' ');
    const hash = generateCacheKey(`${lessonId}:${normalizedTranscript}`);
    return `feedback_${hash}`;
}

/**
 * Check if network is online
 * @returns {boolean}
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Check if should use local analysis vs API
 * @param {Object} options - Options
 * @param {boolean} options.forceLocal - Force local analysis
 * @param {boolean} options.preferLocal - Prefer local if available
 * @param {number} options.transcriptLength - Length of transcript
 * @returns {boolean} True if should use local analysis
 */
export function shouldUseLocalAnalysis(options = {}) {
    const {
        forceLocal = false,
        preferLocal = false,
        transcriptLength = 0,
        maxLocalLength = 500 // Max chars for local analysis
    } = options;
    
    // Force local if specified
    if (forceLocal) return true;
    
    // If offline, must use local
    if (!isOnline()) return true;
    
    // If transcript is short and prefer local, use local
    if (preferLocal && transcriptLength < maxLocalLength) return true;
    
    return false;
}

/**
 * Check if error is retryable
 * @param {Error} error - Error object
 * @returns {boolean}
 */
export function shouldRetry(error) {
    if (!error) return false;
    
    const message = error.message?.toLowerCase() || '';
    
    // Network errors
    if (message.includes('network') || 
        message.includes('failed to fetch') || 
        message.includes('networkerror') ||
        message.includes('offline')) {
        return true;
    }
    
    // Server errors (5xx)
    if (error.cause?.status >= 500 && error.cause?.status < 600) return true;
    
    // Timeout errors
    if (error.name === 'AbortError' || 
        message.includes('timeout') || 
        message.includes('aborted')) {
        return true;
    }
    
    // Rate limiting
    if (error.cause?.status === 429) return true;
    
    return false;
}

/**
 * Get user-friendly error message (bilingual)
 * @param {Error} error - Error object
 * @param {string} language - 'en' or 'ar'
 * @returns {string} User-friendly message
 */
export function getUserFriendlyError(error, language = 'en') {
    const status = error.cause?.status;
    const message = error.message?.toLowerCase() || '';
    
    // English messages
    const enMessages = {
        '429': '⏳ Too many requests. Please wait a moment and try again.',
        '403': '🔒 Session expired. Please refresh the page.',
        '400': '📝 Invalid input. Please check your text and try again.',
        '413': '📏 Text too long. Please try a shorter passage.',
        '503': '🔧 Service temporarily unavailable. Please try again later.',
        '504': '⏱️ Service timeout. Please try again later.',
        'network': '📶 Network error. Please check your connection.',
        'timeout': '⏰ Request timed out. Please try again.',
        'offline': '📴 You are offline. Using local analysis.',
        'default': '❌ Unable to evaluate pronunciation. Please try again.'
    };
    
    // Arabic messages
    const arMessages = {
        '429': '⏳ عدد الطلبات كبير جداً. الرجاء الانتظار قليلاً والمحاولة مرة أخرى.',
        '403': '🔒 انتهت الجلسة. الرجاء تحديث الصفحة.',
        '400': '📝 إدخال غير صالح. الرجاء التحقق من النص والمحاولة مرة أخرى.',
        '413': '📏 النص طويل جداً. الرجاء تجربة مقطع أقصر.',
        '503': '🔧 الخدمة غير متوفرة مؤقتاً. الرجاء المحاولة مرة أخرى لاحقاً.',
        '504': '⏱️ انتهت مهلة الخدمة. الرجاء المحاولة مرة أخرى لاحقاً.',
        'network': '📶 خطأ في الشبكة. الرجاء التحقق من اتصالك.',
        'timeout': '⏰ انتهت مهلة الطلب. الرجاء المحاولة مرة أخرى.',
        'offline': '📴 أنت غير متصل. استخدام التحليل المحلي.',
        'default': '❌ تعذر تقييم النطق. الرجاء المحاولة مرة أخرى.'
    };
    
    const messages = language === 'ar' ? arMessages : enMessages;
    
    // Check by status code
    if (status && messages[status.toString()]) {
        return messages[status.toString()];
    }
    
    // Check by message content
    if (message.includes('network') || message.includes('failed to fetch')) {
        return messages.network;
    }
    
    if (message.includes('timeout') || error.name === 'AbortError') {
        return messages.timeout;
    }
    
    if (!isOnline()) {
        return messages.offline;
    }
    
    return messages.default;
}

/**
 * Generate unique request ID for tracking
 * @returns {string} Request ID
 */
export function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format transcript for API (clean and normalize)
 * @param {string} transcript - Raw transcript
 * @returns {string} Cleaned transcript
 */
export function formatTranscriptForAPI(transcript) {
    if (!transcript) return '';
    
    return transcript
        .replace(/\s+/g, ' ')  // Normalize spaces
        .replace(/[^\w\s\u0600-\u06FF]/g, '') // Remove punctuation (keep Arabic)
        .trim();
}

/**
 * Check if transcript is valid for analysis
 * @param {string} transcript - User's speech transcript
 * @param {number} minLength - Minimum length
 * @returns {boolean}
 */
export function isValidTranscript(transcript, minLength = 3) {
    if (!transcript) return false;
    
    const cleaned = transcript.trim();
    if (cleaned.length < minLength) return false;
    
    // Check if it's not just silence/background noise
    const wordCount = cleaned.split(/\s+/).length;
    return wordCount >= 1;
}

/**
 * Get retry delay with exponential backoff
 * @param {number} attempt - Attempt number (0-based)
 * @returns {number} Delay in ms
 */
export function getRetryDelay(attempt) {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    
    const delay = Math.min(
        baseDelay * Math.pow(2, attempt),
        maxDelay
    );
    
    // Add jitter to prevent thundering herd
    return delay + (Math.random() * 500);
}

export default {
    getCSRFToken,
    generateCacheKey,
    getFeedbackCacheKey,
    isOnline,
    shouldUseLocalAnalysis,
    shouldRetry,
    getUserFriendlyError,
    generateRequestId,
    formatTranscriptForAPI,
    isValidTranscript,
    getRetryDelay
};