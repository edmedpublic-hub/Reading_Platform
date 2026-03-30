// static/reading/highlighting/components/word-highlighter.js
// PURPOSE: Manage word-level highlighting with accessibility and interaction

import { analyzeReading } from '../../reading.analysis.js';
import { 
    normalizeForComparison, 
    hasHonorific, 
    extractHonorific,
    getHighlightClass,
    getHighlightLabel,
    hasArabic,
    HIGHLIGHT_COLORS
} from '../utils/highlight-utils.js';

// Color scheme (exported for other modules)
export const colorScheme = {
    correct: 'word-correct',
    incorrect: 'word-incorrect',
    pending: 'word-pending',
    partial: 'word-partial',
    honorific: 'arabic-honorific',
    missing: 'word-missing',
    extra: 'word-extra'
};

let wordMap = new Map();
let expectedWords = [];
let expectedText = '';
let config = {
    partialThreshold: 0.7,
    highlightPartial: true,
    preserveArabicHonorifics: true,
    enableClickToPractice: true,
    language: 'en'
};

let callbacks = {
    onWordClick: null
};

/**
 * Initialize word highlighter
 * @param {Object} options - Configuration options
 */
export function initWordHighlighter(options = {}) {
    if (options.config) {
        config = { ...config, ...options.config };
    }
    
    if (options.callbacks) {
        callbacks = { ...callbacks, ...options.callbacks };
    }
    
    // Listen for feedback display events from speech recognition
    document.addEventListener('display-feedback', handleFeedbackDisplay);
    
    // Listen for lesson changes to reset
    document.addEventListener('lesson-changed', () => {
        clearHighlights();
    });
    
    console.log('Word highlighter initialized with config:', config);
}

/**
 * Handle feedback display events
 * @param {CustomEvent} event - Feedback display event
 */
function handleFeedbackDisplay(event) {
    const { analysis, transcript } = event.detail;
    
    if (analysis) {
        // Update highlighting based on analysis
        updateWordHighlightingFromAnalysis(analysis);
        
        // If transcript is provided, also do real-time update
        if (transcript) {
            updateWordHighlighting(transcript, true);
        }
    } else if (event.detail.result) {
        // Legacy support for older event format
        updateWordHighlightingFromAnalysis(event.detail.result);
    }
}

/**
 * Prepare words for highlighting
 * @param {string} text - Expected text
 * @param {Array|NodeList} wordElements - DOM elements for words
 * @param {boolean} preserveHonorifics - Whether to preserve Arabic honorifics
 */
export function prepareWords(text, wordElements, preserveHonorifics = true) {
    expectedText = text;
    expectedWords = normalizeForComparison(text, { preserveArabic: preserveHonorifics })
        .split(/\s+/)
        .filter(w => w.length > 0);
    
    wordMap.clear();
    
    // Handle both arrays and NodeLists
    const elements = Array.from(wordElements);
    
    elements.forEach((el, index) => {
        // Add data attribute for index
        el.dataset.wordIndex = index;
        
        // Add ARIA label if not present
        if (!el.hasAttribute('aria-label')) {
            el.setAttribute('aria-label', `Word ${index + 1}: ${el.textContent.trim()}`);
        }
        
        // Check for honorifics
        const text = el.textContent;
        if (hasHonorific(text)) {
            const { honorifics, remaining } = extractHonorific(text);
            el.dataset.hasHonorific = 'true';
            el.dataset.honorifics = JSON.stringify(honorifics);
            
            // Wrap honorifics in span for styling
            honorifics.forEach(h => {
                const span = document.createElement('span');
                span.className = colorScheme.honorific;
                span.textContent = h;
                span.setAttribute('aria-label', 'honorific');
                el.innerHTML = el.innerHTML.replace(h, span.outerHTML);
            });
        }
        
        // Add click handler if enabled
        if (config.enableClickToPractice) {
            el.addEventListener('click', () => handleWordClick(index, el));
            el.style.cursor = 'pointer';
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            
            // Keyboard support
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleWordClick(index, el);
                }
            });
        }
        
        wordMap.set(index, el);
    });
    
    // Apply initial pending state
    resetHighlights();
    
    console.log(`Prepared ${wordMap.size} words for highlighting`);
}

/**
 * Handle word click for practice
 * @param {number} index - Word index
 * @param {HTMLElement} element - Word element
 */
function handleWordClick(index, element) {
    const wordData = {
        index,
        text: element.textContent,
        expected: expectedWords[index],
        status: getWordStatus(element)
    };
    
    // Trigger callback
    if (callbacks.onWordClick) {
        callbacks.onWordClick(wordData);
    }
    
    // Dispatch event for other modules
    document.dispatchEvent(new CustomEvent('word-clicked', {
        detail: wordData
    }));
}

/**
 * Get current status of a word element
 * @param {HTMLElement} element - Word element
 * @returns {string} Status
 */
function getWordStatus(element) {
    if (element.classList.contains(colorScheme.correct)) return 'correct';
    if (element.classList.contains(colorScheme.incorrect)) return 'incorrect';
    if (element.classList.contains(colorScheme.partial)) return 'partial';
    if (element.classList.contains(colorScheme.missing)) return 'missing';
    if (element.classList.contains(colorScheme.extra)) return 'extra';
    return 'pending';
}

/**
 * Update word highlighting based on analysis result
 * @param {Object} analysis - Analysis result from analyzeReading
 */
export function updateWordHighlightingFromAnalysis(analysis) {
    if (!analysis || expectedWords.length === 0) return;
    
    // Reset all words to pending first
    resetHighlights();
    
    // Apply correct words
    if (analysis.correct) {
        analysis.correct.forEach(item => {
            const index = item.expectedIndex !== undefined ? item.expectedIndex : item.index;
            if (index !== undefined) {
                highlightWord(index, 'correct');
            }
        });
    }
    
    // Apply incorrect words
    if (analysis.incorrect) {
        analysis.incorrect.forEach(item => {
            const index = item.expectedIndex;
            if (index !== undefined) {
                const similarity = item.confidence || 
                    (item.similarity ? item.similarity * 100 : 0);
                
                const isPartial = config.highlightPartial && similarity >= (config.partialThreshold * 100);
                
                if (isPartial) {
                    highlightWord(index, 'partial', { 
                        title: `Close match: heard "${item.heard || ''}"`,
                        heard: item.heard 
                    });
                } else {
                    highlightWord(index, 'incorrect', { 
                        title: `Incorrect: heard "${item.heard || ''}"`,
                        heard: item.heard 
                    });
                }
            }
        });
    }
    
    // Mark missing words
    if (analysis.missing) {
        analysis.missing.forEach(item => {
            const index = item.expectedIndex !== undefined ? item.expectedIndex : item.index;
            if (index !== undefined) {
                const element = wordMap.get(index);
                if (element && !element.classList.contains(colorScheme.correct)) {
                    highlightWord(index, 'missing', { 
                        title: 'Missing word'
                    });
                }
            }
        });
    }
    
    // Mark extra words (these don't map to expected indices)
    if (analysis.extra && analysis.extra.length > 0) {
        // Dispatch event for UI to show extra words separately
        document.dispatchEvent(new CustomEvent('extra-words-detected', {
            detail: { words: analysis.extra }
        }));
    }
    
    // Dispatch completion event
    document.dispatchEvent(new CustomEvent('word-highlighting-complete', {
        detail: { stats: getHighlightStats() }
    }));
}

/**
 * Update word highlighting based on spoken text (real-time)
 * @param {string} spokenText - What the student said
 * @param {boolean} isFinal - Whether this is final update
 * @returns {Object} Analysis result
 */
export function updateWordHighlighting(spokenText, isFinal = false) {
    if (!spokenText || expectedWords.length === 0) return null;
    
    const normalizedSpoken = normalizeForComparison(spokenText, { 
        preserveArabic: config.preserveArabicHonorifics 
    });
    
    const result = analyzeReading(
        normalizedSpoken,
        expectedWords.join(' '),
        { preserveArabicHonorifics: config.preserveArabicHonorifics }
    );
    
    updateWordHighlightingFromAnalysis(result);
    
    return result;
}

/**
 * Highlight a specific word
 * @param {number} index - Word index
 * @param {string} type - Highlight type (correct, incorrect, partial, missing)
 * @param {Object} options - Additional options
 */
function highlightWord(index, type, options = {}) {
    const element = wordMap.get(index);
    if (!element) return;
    
    // Remove existing highlight classes
    Object.values(colorScheme).forEach(cls => {
        element.classList.remove(cls);
    });
    
    // Add new highlight class
    const className = colorScheme[type] || type;
    element.classList.add(className);
    
    // Update ARIA label
    const label = getHighlightLabel(type, element.textContent, config.language);
    element.setAttribute('aria-label', label);
    
    // Add title for hover (fallback)
    if (options.title) {
        element.title = options.title;
    } else {
        element.title = type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    // Store heard word if provided
    if (options.heard) {
        element.dataset.heard = options.heard;
    }
}

/**
 * Reset all highlights to pending state
 */
export function resetHighlights() {
    wordMap.forEach((element, index) => {
        Object.values(colorScheme).forEach(cls => {
            element.classList.remove(cls);
        });
        
        element.classList.add(colorScheme.pending);
        element.removeAttribute('title');
        element.removeAttribute('data-heard');
        
        // Restore original ARIA label
        element.setAttribute('aria-label', `Word ${index + 1}: ${element.textContent.trim()}`);
    });
}

/**
 * Get highlight statistics
 * @returns {Object} Statistics
 */
export function getHighlightStats() {
    let correct = 0, incorrect = 0, partial = 0, pending = 0, missing = 0;
    
    wordMap.forEach(element => {
        if (element.classList.contains(colorScheme.correct)) correct++;
        else if (element.classList.contains(colorScheme.partial)) partial++;
        else if (element.classList.contains(colorScheme.incorrect)) incorrect++;
        else if (element.classList.contains(colorScheme.missing)) missing++;
        else pending++;
    });
    
    const total = wordMap.size;
    const weightedCorrect = correct + (partial * 0.5);
    
    return {
        total,
        correct,
        incorrect,
        partial,
        missing,
        pending,
        accuracy: total > 0 ? (weightedCorrect / total * 100).toFixed(1) : 0,
        weightedScore: total > 0 ? (weightedCorrect / total * 100).toFixed(1) : 0
    };
}

/**
 * Get word at index
 * @param {number} index - Word index
 * @returns {Object} Word data
 */
export function getWord(index) {
    const element = wordMap.get(index);
    if (!element) return null;
    
    return {
        index,
        element,
        text: element.textContent,
        status: getWordStatus(element),
        expected: expectedWords[index]
    };
}

/**
 * Clear all highlights and reset word map
 */
export function clearHighlights() {
    resetHighlights();
    wordMap.clear();
    expectedWords = [];
    expectedText = '';
}

/**
 * Set language for ARIA labels
 * @param {string} language - 'en' or 'ar'
 */
export function setLanguage(language) {
    config.language = language;
}

/**
 * Destroy and clean up
 */
export function destroy() {
    document.removeEventListener('display-feedback', handleFeedbackDisplay);
    document.removeEventListener('lesson-changed', clearHighlights);
    clearHighlights();
}

export default {
    initWordHighlighter,
    prepareWords,
    updateWordHighlighting,
    updateWordHighlightingFromAnalysis,
    resetHighlights,
    getHighlightStats,
    getWord,
    setLanguage,
    clearHighlights,
    destroy,
    colorScheme
};