// static/reading/text-to-speech/utils/tts-utils.js
// PURPOSE: Utility functions for text-to-speech

// Cache for mobile detection
let isMobileCache = null;

/**
 * Extract sentences from text with improved punctuation handling
 * @param {string} text - Raw text (may contain HTML)
 * @returns {Array} Array of sentences
 */
export function extractSentences(text) {
    if (!text) return [];
    
    // First strip HTML tags to get clean text
    const cleanText = stripHtml(text);
    
    // Check for Arabic
    const arabic = hasArabic(cleanText);
    
    if (arabic) {
        return extractArabicSentences(cleanText);
    } else {
        return extractEnglishSentences(cleanText);
    }
}

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
    if (!html) return '';
    
    // Create temporary element to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

/**
 * Extract English sentences with abbreviation handling
 * @param {string} text - Plain text
 * @returns {Array} Sentences
 */
function extractEnglishSentences(text) {
    // Normalize whitespace
    const normalized = text.replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    if (!normalized) return [];
    
    // Common abbreviations that shouldn't end sentences
    const abbreviations = [
        'dr', 'mr', 'ms', 'mrs', 'prof', 'rev', 'hon', 'jr', 'sr',
        'etc', 'vs', 'inc', 'ltd', 'co', 'corp', 'e.g', 'i.e', 'ph.d',
        'a.m', 'p.m', 'b.c', 'a.d', 'approx', 'apt', 'ave', 'blvd',
        'ctr', 'dept', 'est', 'min', 'max', 'mt', 'rd', 'st'
    ];
    
    // Create regex pattern for abbreviations
    const abbrPattern = new RegExp('\\b(' + abbreviations.join('|') + ')\\.', 'gi');
    
    // Temporarily mark abbreviations
    let processed = normalized.replace(abbrPattern, '$1<ABBR>');
    
    // Split sentences on punctuation followed by space and capital letter
    const sentences = processed.split(/(?<=[.!?])\s+(?=[A-Z])/);
    
    // Restore abbreviations
    return sentences.map(s => s.replace(/<ABBR>/g, '.')).filter(s => s.length > 0);
}

/**
 * Extract Arabic sentences with comprehensive punctuation
 * @param {string} text - Plain text
 * @returns {Array} Sentences
 */
function extractArabicSentences(text) {
    // Normalize whitespace
    const normalized = text.replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    if (!normalized) return [];
    
    // Arabic sentence delimiters
    // ؟ - Question mark
    // . - Period
    // ! - Exclamation
    // ، - Comma (not always sentence end, but sometimes used)
    // ؛ - Semicolon
    const sentences = normalized
        .split(/(?<=[.!?؟!،؛])\s+/)
        .filter(s => s.trim().length > 0);
    
    return sentences;
}

/**
 * Detect if text contains Arabic
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function hasArabic(text) {
    if (!text) return false;
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Detect if text contains English
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function hasEnglish(text) {
    if (!text) return false;
    return /[a-zA-Z]/.test(text);
}

/**
 * Check if device is mobile (cached)
 * @returns {boolean}
 */
export function isMobile() {
    if (isMobileCache !== null) return isMobileCache;
    
    isMobileCache = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobileCache;
}

/**
 * Create a sentence element
 * @param {string} text - Sentence text
 * @param {number} index - Sentence index
 * @param {boolean} rtl - Whether text is RTL
 * @returns {string} HTML string
 */
export function createSentenceElement(text, index, rtl = false) {
    const dir = rtl ? 'dir="auto"' : '';
    // Escape text to prevent XSS
    const escapedText = escapeHtml(text);
    return `<p class="reading-sentence" data-sentence="${index}" ${dir}>${escapedText}</p>`;
}

/**
 * Simple HTML escape (since we can't import from ui here)
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
        .replace(/'/g, '&#039;');
}

/**
 * Get language of text
 * @param {string} text - Text to analyze
 * @returns {string} 'ar', 'en', or 'mixed'
 */
export function getTextLanguage(text) {
    if (!text) return 'unknown';
    
    const hasAr = hasArabic(text);
    const hasEn = hasEnglish(text);
    
    if (hasAr && hasEn) return 'mixed';
    if (hasAr) return 'ar';
    if (hasEn) return 'en';
    return 'unknown';
}

/**
 * Normalize text for comparison
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeForTTS(text) {
    if (!text) return '';
    
    return text
        .replace(/\s+/g, ' ')           // Normalize spaces
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
        .trim();
}

export default {
    extractSentences,
    hasArabic,
    hasEnglish,
    getTextLanguage,
    isMobile,
    createSentenceElement,
    normalizeForTTS,
    stripHtml
};