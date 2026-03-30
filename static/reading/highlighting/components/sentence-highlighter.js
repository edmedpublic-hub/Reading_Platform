// static/reading/highlighting/components/sentence-highlighter.js
// PURPOSE: Manage sentence-level highlighting for TTS and feedback

import { 
    getHighlightClass, 
    getHighlightLabel, 
    hasArabic,
    getScrollPosition,
    isInViewport
} from '../utils/highlight-utils.js';

let sentenceMap = new Map();
let container = null;
let currentSentenceIndex = -1;
let autoScrollEnabled = true;
let accuracyThresholds = {
    correct: 100,
    partial: 70,
    incorrect: 0
};
let callbacks = {
    onSentenceChange: null
};

/**
 * Initialize sentence highlighter
 * @param {HTMLElement} containerEl - Container element
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoScroll - Enable auto-scroll
 * @param {Object} options.thresholds - Accuracy thresholds
 * @param {Function} options.onSentenceChange - Callback when sentence changes
 */
export function initSentenceHighlighter(containerEl, options = {}) {
    container = containerEl;
    autoScrollEnabled = options.autoScroll !== false;
    
    if (options.thresholds) {
        accuracyThresholds = { ...accuracyThresholds, ...options.thresholds };
    }
    
    if (options.onSentenceChange) {
        callbacks.onSentenceChange = options.onSentenceChange;
    }
    
    // Set up TTS progress listener
    document.addEventListener('tts-progress', handleTTSProgress);
    
    // Set up analysis listener for feedback highlighting
    document.addEventListener('display-feedback', handleFeedbackDisplay);
    
    console.log('Sentence highlighter initialized');
}

/**
 * Handle TTS progress events
 * @param {CustomEvent} event - TTS progress event
 */
function handleTTSProgress(event) {
    const { sentenceIndex, progress } = event.detail;
    
    if (sentenceIndex !== undefined && sentenceIndex !== currentSentenceIndex) {
        highlightSentence(sentenceIndex);
    }
}

/**
 * Handle feedback display events
 * @param {CustomEvent} event - Feedback display event
 */
function handleFeedbackDisplay(event) {
    const { analysis } = event.detail;
    if (analysis) {
        updateSentenceHighlighting(analysis);
    }
}

/**
 * Build sentence map from DOM
 * @param {Map} wordMap - Map of word indices to elements (optional)
 */
export function buildSentenceMap(wordMap = null) {
    sentenceMap.clear();
    
    if (!container) return;
    
    const sentenceElements = container.querySelectorAll('.reading-sentence');
    
    sentenceElements.forEach((sentenceEl, sIndex) => {
        const wordIndices = [];
        
        // Try to get word indices from data attributes
        if (wordMap) {
            const words = sentenceEl.querySelectorAll('[data-word-index]');
            words.forEach(wordEl => {
                const index = parseInt(wordEl.dataset.wordIndex, 10);
                if (!isNaN(index)) {
                    wordIndices.push(index);
                }
            });
        }
        
        // Store sentence data
        sentenceMap.set(sIndex, {
            element: sentenceEl,
            wordIndices,
            text: sentenceEl.textContent,
            accuracy: 0
        });
        
        // Check for RTL
        if (hasArabic(sentenceEl.textContent)) {
            sentenceEl.setAttribute('dir', 'auto');
        }
    });
    
    console.log(`Built sentence map with ${sentenceMap.size} sentences`);
}

/**
 * Highlight a specific sentence (for TTS)
 * @param {number} index - Sentence index
 * @param {boolean} shouldScroll - Whether to scroll to sentence
 */
export function highlightSentence(index, shouldScroll = true) {
    if (!container) return;
    
    // Remove active class from all sentences
    container.querySelectorAll('.reading-sentence').forEach(el => {
        el.classList.remove('sentence-active', 'highlight-current');
        el.removeAttribute('aria-current');
    });
    
    // Find and highlight target sentence
    const targetEl = container.querySelector(`[data-sentence="${index}"]`);
    if (targetEl) {
        targetEl.classList.add('sentence-active', 'highlight-current');
        targetEl.setAttribute('aria-current', 'location');
        
        // Add ARIA label
        const label = getHighlightLabel('current', `Sentence ${index + 1}`);
        targetEl.setAttribute('aria-label', label);
        
        currentSentenceIndex = index;
        
        // Scroll if enabled
        if (shouldScroll && autoScrollEnabled) {
            scrollToSentence(targetEl);
        }
        
        // Trigger callback
        if (callbacks.onSentenceChange) {
            callbacks.onSentenceChange({
                index,
                element: targetEl,
                text: targetEl.textContent
            });
        }
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent('sentence-highlighted', {
            detail: { index, timestamp: Date.now() }
        }));
    }
}

/**
 * Scroll to a sentence
 * @param {HTMLElement} sentenceEl - Sentence element
 */
function scrollToSentence(sentenceEl) {
    if (!sentenceEl) return;
    
    // Check if already in viewport
    if (isInViewport(sentenceEl, 50)) {
        return;
    }
    
    const isRTL = document.documentElement.dir === 'rtl';
    const scrollPos = getScrollPosition(sentenceEl, {
        block: 'center',
        rtl: isRTL
    });
    
    window.scrollTo(scrollPos);
}

/**
 * Update sentence highlighting based on word results
 * @param {Object} result - Analysis result from word highlighter
 */
export function updateSentenceHighlighting(result) {
    if (!container || !result) return;
    
    // Rebuild word indices if needed
    if (sentenceMap.size === 0) {
        buildSentenceMap();
    }
    
    sentenceMap.forEach((sentenceData, sentenceIndex) => {
        const { element, wordIndices } = sentenceData;
        if (!element) return;
        
        // Count correct words in this sentence
        const correctInSentence = wordIndices.filter(index => 
            result.correct?.some(c => c.expectedIndex === index)
        ).length;
        
        const totalInSentence = wordIndices.length || 1; // Avoid division by zero
        const accuracy = (correctInSentence / totalInSentence) * 100;
        
        // Store accuracy
        sentenceData.accuracy = accuracy;
        
        // Apply sentence-level classes
        element.classList.remove(
            'sentence-correct',
            'sentence-partial',
            'sentence-incorrect',
            'sentence-high-accuracy',
            'sentence-medium-accuracy',
            'sentence-low-accuracy'
        );
        
        // Determine class based on accuracy
        let accuracyClass = '';
        if (accuracy >= accuracyThresholds.correct) {
            accuracyClass = 'sentence-correct';
            element.classList.add('sentence-correct');
        } else if (accuracy >= accuracyThresholds.partial) {
            accuracyClass = 'sentence-partial';
            element.classList.add('sentence-partial');
        } else {
            accuracyClass = 'sentence-incorrect';
            element.classList.add('sentence-incorrect');
        }
        
        // Add accuracy data attribute
        element.dataset.accuracy = accuracy.toFixed(1);
        
        // Add ARIA label
        const ariaLabel = getAccuracyLabel(accuracy, accuracyClass);
        element.setAttribute('aria-label', ariaLabel);
    });
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('sentence-analysis-complete', {
        detail: { 
            accuracy: Array.from(sentenceMap.values()).map(s => s.accuracy),
            timestamp: Date.now() 
        }
    }));
}

/**
 * Get accuracy label for accessibility
 * @param {number} accuracy - Accuracy percentage
 * @param {string} className - Applied class name
 * @returns {string} ARIA label
 */
function getAccuracyLabel(accuracy, className) {
    const rounded = Math.round(accuracy);
    
    if (className.includes('correct')) {
        return `Sentence read correctly with ${rounded}% accuracy`;
    } else if (className.includes('partial')) {
        return `Sentence partially correct with ${rounded}% accuracy`;
    } else {
        return `Sentence needs practice with ${rounded}% accuracy`;
    }
}

/**
 * Get current sentence index
 * @returns {number} Current sentence index
 */
export function getCurrentSentence() {
    return currentSentenceIndex;
}

/**
 * Set auto-scroll behavior
 * @param {boolean} enabled
 */
export function setAutoScroll(enabled) {
    autoScrollEnabled = enabled;
}

/**
 * Reset sentence highlights (for both TTS and feedback)
 */
export function resetSentenceHighlights() {
    if (!container) return;
    
    container.querySelectorAll('.reading-sentence').forEach(el => {
        el.classList.remove(
            'sentence-active',
            'sentence-correct',
            'sentence-partial',
            'sentence-incorrect',
            'sentence-high-accuracy',
            'sentence-medium-accuracy',
            'sentence-low-accuracy',
            'highlight-current'
        );
        el.removeAttribute('aria-current');
        el.removeAttribute('aria-label');
        el.removeAttribute('data-accuracy');
    });
    
    currentSentenceIndex = -1;
}

/**
 * Get sentence map
 * @returns {Map} Sentence map with data
 */
export function getSentenceMap() {
    return sentenceMap;
}

/**
 * Get sentence accuracy
 * @param {number} index - Sentence index
 * @returns {number} Accuracy percentage
 */
export function getSentenceAccuracy(index) {
    return sentenceMap.get(index)?.accuracy || 0;
}

/**
 * Destroy and clean up
 */
export function destroy() {
    document.removeEventListener('tts-progress', handleTTSProgress);
    document.removeEventListener('display-feedback', handleFeedbackDisplay);
    resetSentenceHighlights();
    sentenceMap.clear();
}

export default {
    initSentenceHighlighter,
    buildSentenceMap,
    highlightSentence,
    updateSentenceHighlighting,
    getCurrentSentence,
    setAutoScroll,
    resetSentenceHighlights,
    getSentenceMap,
    getSentenceAccuracy,
    destroy
};