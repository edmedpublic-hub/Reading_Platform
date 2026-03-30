// static/reading/text-to-speech/components/sentence-reader.js
// PURPOSE: Manage sentence queue, highlighting, and reading progression

import { extractSentences, hasArabic, createSentenceElement, isMobile } from '../utils/tts-utils.js';

let container = null;
let sentences = [];
let currentIndex = -1;
let queue = [];
let onSentenceChangeCallback = null;
let autoScrollEnabled = true;
let scrollBehavior = 'smooth';

/**
 * Initialize sentence reader
 * @param {HTMLElement} textContainer - Container element
 * @param {Function} onSentenceChange - Callback when sentence changes
 * @param {Object} options - Additional options
 * @param {boolean} options.autoScroll - Enable auto-scroll
 * @param {string} options.scrollBehavior - 'smooth' or 'auto'
 */
export function initSentenceReader(textContainer, onSentenceChange = null, options = {}) {
    if (!textContainer) {
        console.error('SentenceReader: No container provided');
        return false;
    }
    
    container = textContainer;
    onSentenceChangeCallback = onSentenceChange;
    autoScrollEnabled = options.autoScroll !== false;
    scrollBehavior = options.scrollBehavior || (isMobile() ? 'auto' : 'smooth');
    
    console.log('Sentence reader initialized', { autoScrollEnabled, scrollBehavior });
    return true;
}

/**
 * Load sentences from text
 * @param {string} text - Raw text
 * @returns {Array} Array of sentence objects
 */
export function loadSentences(text) {
    if (!container) {
        console.error('SentenceReader: Not initialized');
        return [];
    }
    
    if (!text) {
        console.warn('SentenceReader: No text provided');
        container.innerHTML = '';
        sentences = [];
        return [];
    }
    
    const rawSentences = extractSentences(text);
    const arabic = hasArabic(text);
    
    // Create DOM structure
    container.innerHTML = rawSentences.map((s, i) => 
        createSentenceElement(s, i, arabic)
    ).join('');
    
    if (arabic) {
        container.setAttribute('dir', 'auto');
    }
    
    // Store sentences with DOM references
    sentences = Array.from(container.querySelectorAll('.reading-sentence')).map((el, index) => ({
        text: el.textContent,
        element: el,
        index
    }));
    
    console.log(`Loaded ${sentences.length} sentences`);
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('sentences-loaded', {
        detail: { count: sentences.length, arabic }
    }));
    
    return sentences;
}

/**
 * Get all sentences
 * @returns {Array} Sentences array
 */
export function getSentences() {
    if (sentences.length > 0) return sentences;
    
    // Fallback: try to get from DOM
    if (!container) return [];
    
    sentences = Array.from(container.querySelectorAll('.reading-sentence')).map((el, index) => ({
        text: el.textContent,
        element: el,
        index
    }));
    
    return sentences;
}

/**
 * Get total sentence count
 * @returns {number}
 */
export function getSentenceCount() {
    return getSentences().length;
}

/**
 * Start reading from specific sentence
 * @param {number} startIndex - Starting index
 * @returns {Array} Queue of sentences
 */
export function startQueue(startIndex = 0) {
    const allSentences = getSentences();
    
    if (allSentences.length === 0) {
        console.warn('SentenceReader: No sentences to read');
        return [];
    }
    
    // Validate startIndex
    if (startIndex < 0) startIndex = 0;
    if (startIndex >= allSentences.length) startIndex = allSentences.length - 1;
    
    currentIndex = startIndex;
    queue = allSentences.slice(startIndex);
    
    console.log(`Started queue at index ${startIndex}, ${queue.length} sentences remaining`);
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('queue-started', {
        detail: { startIndex, remaining: queue.length }
    }));
    
    return queue;
}

/**
 * Get next sentence in queue
 * @returns {Object|null} Next sentence or null
 */
export function getNextSentence() {
    if (queue.length === 0) {
        console.log('SentenceReader: Queue empty');
        return null;
    }
    
    const sentence = queue[0];
    currentIndex = sentence.index;
    
    // Highlight and scroll
    highlightSentence(currentIndex, true);
    
    if (onSentenceChangeCallback) {
        onSentenceChangeCallback(sentence);
    }
    
    return sentence;
}

/**
 * Mark current sentence as read and advance
 */
export function advanceQueue() {
    if (queue.length > 0) {
        const finished = queue.shift();
        
        // Optional: dim finished sentences
        if (finished.element) {
            finished.element.classList.add('read-sentence');
        }
        
        console.log(`Advanced queue, ${queue.length} remaining`);
        
        // Dispatch event
        document.dispatchEvent(new CustomEvent('queue-advanced', {
            detail: { remaining: queue.length, finished: finished.index }
        }));
    }
}

/**
 * Get current sentence index
 * @returns {number}
 */
export function getCurrentIndex() {
    return currentIndex;
}

/**
 * Check if queue is empty
 * @returns {boolean}
 */
export function isQueueEmpty() {
    return queue.length === 0;
}

/**
 * Clear queue and reset
 */
export function resetQueue() {
    queue = [];
    currentIndex = -1;
    
    // Remove all highlights
    if (container) {
        container.querySelectorAll('.reading-sentence').forEach(el => {
            el.classList.remove('active-sentence', 'highlight', 'read-sentence');
        });
    }
    
    console.log('Queue reset');
}

/**
 * Highlight a specific sentence and optionally scroll to it
 * @param {number} index - Sentence index
 * @param {boolean} shouldScroll - Whether to scroll to the sentence
 */
export function highlightSentence(index, shouldScroll = true) {
    if (!container) return;
    
    // Remove highlights from all sentences
    container.querySelectorAll('.reading-sentence').forEach(el => {
        el.classList.remove('active-sentence', 'highlight');
    });
    
    // Add highlight to current sentence
    const currentEl = container.querySelector(`[data-sentence="${index}"]`);
    if (currentEl) {
        currentEl.classList.add('active-sentence', 'highlight');
        
        // Scroll if enabled
        if (shouldScroll && autoScrollEnabled) {
            scrollToElement(currentEl);
        }
    } else {
        console.warn(`SentenceReader: Element for index ${index} not found`);
    }
}

/**
 * Scroll to an element
 * @param {HTMLElement} element - Element to scroll to
 */
function scrollToElement(element) {
    if (!element) return;
    
    try {
        element.scrollIntoView({
            behavior: scrollBehavior,
            block: isMobile() ? 'nearest' : 'center',
            inline: 'nearest'
        });
    } catch (error) {
        // Fallback for older browsers
        element.scrollIntoView(false);
    }
}

/**
 * Set auto-scroll behavior
 * @param {boolean} enabled
 */
export function setAutoScroll(enabled) {
    autoScrollEnabled = enabled;
    console.log(`Auto-scroll ${enabled ? 'enabled' : 'disabled'}`);
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('auto-scroll-changed', {
        detail: { enabled }
    }));
}

/**
 * Get auto-scroll state
 * @returns {boolean}
 */
export function getAutoScroll() {
    return autoScrollEnabled;
}

/**
 * Scroll to current sentence
 */
export function scrollToCurrent() {
    if (currentIndex >= 0 && container) {
        const currentEl = container.querySelector(`[data-sentence="${currentIndex}"]`);
        if (currentEl) {
            scrollToElement(currentEl);
        }
    }
}

/**
 * Get sentence by index
 * @param {number} index - Sentence index
 * @returns {Object|null} Sentence or null
 */
export function getSentence(index) {
    const allSentences = getSentences();
    return allSentences[index] || null;
}

/**
 * Get current sentence object
 * @returns {Object|null}
 */
export function getCurrentSentence() {
    if (currentIndex < 0) return null;
    return getSentence(currentIndex);
}

/**
 * Jump to specific sentence
 * @param {number} index - Target index
 * @returns {boolean} Success
 */
export function jumpToSentence(index) {
    const allSentences = getSentences();
    
    if (index < 0 || index >= allSentences.length) {
        console.warn(`SentenceReader: Invalid index ${index}`);
        return false;
    }
    
    // Update queue starting from this index
    queue = allSentences.slice(index);
    currentIndex = index;
    
    highlightSentence(index, true);
    
    console.log(`Jumped to sentence ${index}`);
    
    return true;
}
export function syncWithHighlighter() {
    const sentences = document.querySelectorAll('.reading-sentence');
    if (sentences.length > 0) {
        // Update the internal queue with the found elements
        this.setQueue(Array.from(sentences)); 
        console.log(`🔊 TTS synced with ${sentences.length} sentences`);
    }
}
/**
 * Updates the internal queue with an array of DOM elements
 * @param {Array<HTMLElement>} elementsArray 
 */
export function setQueue(elementsArray) {
    if (!Array.isArray(elementsArray)) {
        console.warn("SentenceReader: setQueue expected an array.");
        return;
    }

    // Map the elements to our internal sentence format
    queue = elementsArray.map((el, index) => ({
        element: el,
        index: index,
        text: el.textContent.trim()
    }));

    
    currentIndex = -1; // Reset to start
    
    console.log(`🔊 SentenceReader: Queue updated with ${queue.length} sentences.`);
}

export default {
    initSentenceReader,
    loadSentences,
    getSentences,
    getSentenceCount,
    startQueue,
    getNextSentence,
    advanceQueue,
    getCurrentIndex,
    getCurrentSentence,
    isQueueEmpty,
    resetQueue,
    highlightSentence,
    setAutoScroll,
    getAutoScroll,
    scrollToCurrent,
    jumpToSentence,
    setQueue
};