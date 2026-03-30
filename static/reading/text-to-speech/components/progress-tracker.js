// static/reading/text-to-speech/components/progress-tracker.js
// PURPOSE: Track TTS progress and emit events

let totalSentences = 0;
let currentSentenceIndex = -1;
let isInitialized = false;

/**
 * Initialize progress tracker
 * @param {number} total - Total number of sentences
 * @returns {boolean} Success status
 */
export function initProgressTracker(total) {
    if (typeof total !== 'number' || total < 0) {
        console.error('ProgressTracker: Invalid total sentences', total);
        return false;
    }
    
    totalSentences = total;
    currentSentenceIndex = -1;
    isInitialized = true;
    
    console.log(`Progress tracker initialized with ${total} sentences`);
    return true;
}

/**
 * Check if tracker is initialized
 * @returns {boolean}
 */
export function isInitialized() {
    return isInitialized;
}

/**
 * Update current sentence
 * @param {number} index - Current sentence index
 * @returns {boolean} Success status
 */
export function setCurrentSentence(index) {
    if (!isInitialized) {
        console.warn('ProgressTracker: Not initialized');
        return false;
    }
    
    if (typeof index !== 'number' || index < -1 || index >= totalSentences) {
        console.error('ProgressTracker: Invalid sentence index', index);
        return false;
    }
    
    const previousIndex = currentSentenceIndex;
    currentSentenceIndex = index;
    
    // Emit progress event
    emitProgress();
    
    // Emit completion event if we just finished
    if (previousIndex !== totalSentences - 1 && currentSentenceIndex === totalSentences - 1) {
        emitComplete();
    }
    
    // Emit start event if we just started
    if (previousIndex === -1 && currentSentenceIndex >= 0) {
        emitStart();
    }
    
    return true;
}

/**
 * Calculate current progress
 * @returns {number} Progress percentage (0-100)
 */
export function getProgress() {
    if (!isInitialized || totalSentences === 0) {
        return 0;
    }
    
    if (currentSentenceIndex < 0) {
        return 0;
    }
    
    const progress = ((currentSentenceIndex + 1) / totalSentences) * 100;
    return Math.min(100, Math.max(0, Math.round(progress * 10) / 10)); // Round to 1 decimal
}

/**
 * Get current sentence index
 * @returns {number} Current index (-1 if not started)
 */
export function getCurrentIndex() {
    return currentSentenceIndex;
}

/**
 * Get total sentences count
 * @returns {number} Total sentences
 */
export function getTotalSentences() {
    return totalSentences;
}

/**
 * Check if reading is complete
 * @returns {boolean}
 */
export function isComplete() {
    return isInitialized && currentSentenceIndex === totalSentences - 1;
}

/**
 * Reset progress
 */
export function resetProgress() {
    const wasActive = currentSentenceIndex >= 0;
    currentSentenceIndex = -1;
    
    emitProgress();
    emitEvent('tts-progress-reset', { 
        wasActive,
        timestamp: Date.now() 
    });
}

/**
 * Mark as complete (100%)
 */
export function markComplete() {
    if (!isInitialized) return;
    
    const wasComplete = isComplete();
    currentSentenceIndex = totalSentences - 1;
    
    emitProgress();
    
    if (!wasComplete) {
        emitComplete();
    }
}

/**
 * Emit progress event
 */
function emitProgress() {
    const progress = getProgress();
    const eventDetail = { 
        progress, 
        sentenceIndex: currentSentenceIndex,
        total: totalSentences,
        isComplete: isComplete(),
        timestamp: Date.now()
    };
    
    document.dispatchEvent(new CustomEvent('tts-progress', {
        detail: eventDetail
    }));
}

/**
 * Emit completion event
 */
function emitComplete() {
    document.dispatchEvent(new CustomEvent('tts-complete', {
        detail: { 
            progress: 100,
            sentenceIndex: currentSentenceIndex,
            total: totalSentences,
            timestamp: Date.now()
        }
    }));
}

/**
 * Emit start event
 */
function emitStart() {
    document.dispatchEvent(new CustomEvent('tts-start', {
        detail: { 
            progress: 0,
            sentenceIndex: currentSentenceIndex,
            total: totalSentences,
            timestamp: Date.now()
        }
    }));
}

/**
 * Emit custom event
 */
function emitEvent(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Get progress state object
 * @returns {Object} Current state
 */
export function getState() {
    return {
        total: totalSentences,
        current: currentSentenceIndex,
        progress: getProgress(),
        isComplete: isComplete(),
        isInitialized,
        hasStarted: currentSentenceIndex >= 0
    };
}

export default {
    initProgressTracker,
    isInitialized,
    setCurrentSentence,
    getProgress,
    getCurrentIndex,
    getTotalSentences,
    isComplete,
    resetProgress,
    markComplete,
    getState
};