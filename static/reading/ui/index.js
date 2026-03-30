// static/reading/ui/index.js
// PURPOSE: Public API for UI module - re-exports all components and utilities

// ==================== UTILITIES ====================

import { createElement, createFragment, createTextElement } from './utils/dom-creator.js';
export { createElement, createFragment, createTextElement };

import { escapeHtml, escapeText, escapeAttr, sanitizeUrl } from './utils/html-escaper.js';
export { escapeHtml, escapeText, escapeAttr, sanitizeUrl };

import { 
    announceToScreenReader, 
    createAnnouncer 
} from './utils/screen-reader.js';
export { announceToScreenReader, createAnnouncer };

// ==================== FEEDBACK COMPONENTS ====================

import { 
    renderFeedback, 
    clearFeedback,
    showFeedbackError 
} from './components/feedback-display.js';
export { renderFeedback, clearFeedback, showFeedbackError };

import { 
    updateScoreDisplay, 
    getScoreClass as getScoreClassFromModule,
    animateScoreChange 
} from './components/score-display.js';
export { updateScoreDisplay, getScoreClassFromModule as getScoreClass, animateScoreChange };

import { 
    displayProblemWords, 
    updateProblemWords,
    clearProblemWords 
} from './components/problem-words.js';
export { displayProblemWords, updateProblemWords, clearProblemWords };

// ==================== PROGRESS COMPONENTS ====================

import { 
    updateProgressBar, 
    resetProgress, 
    initProgressTracking,
    getProgressState,
    setProgressWeights 
} from './components/progress-bar.js';
export { updateProgressBar, resetProgress, initProgressTracking, getProgressState, setProgressWeights };

// ==================== RECORDING COMPONENTS ====================

import { 
    updateRecordingStatus, 
    updateAudioLevel,
    resetRecordingStatus,
    getRecordingState 
} from './components/recording-status.js';
export { updateRecordingStatus, updateAudioLevel, resetRecordingStatus, getRecordingState };

// ==================== NOTIFICATION COMPONENTS ====================

import { 
    showLoading, 
    hideLoading,
    updateProgress as updateLoadingProgress,
    withLoading,
    showSkeleton 
} from './components/loading-indicator.js';
export { showLoading, hideLoading, updateLoadingProgress, withLoading, showSkeleton };

import { 
    showError, 
    hideError,
    clearError,
    getFriendlyErrorMessage
} from './components/error-display.js';
export { showError, hideError, clearError, getFriendlyErrorMessage };

import { 
    showSuccess, 
    showInfo,
    showWarning,
    showError as showToastError,
    clearAllToasts,
    removeToastById 
} from './components/success-toast.js';
export { showSuccess, showInfo, showWarning, showToastError, clearAllToasts, removeToastById };

// ==================== INITIALIZATION ====================

export function initUI(options = {}) {
    const {
        language = 'en',
        progress = {}
    } = options;

    if (language === 'ar') {
        document.documentElement.setAttribute('dir', 'rtl');
    }

    initProgressTracking(progress);
    setupGlobalListeners();

}

/**
 * Get score class based on percentage (local function)
 */
function getScoreClassLocal(score) {
    if (score >= 85) return 'text-success';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-warning';
    return 'text-danger';
}

/**
 * Display pronunciation feedback in the UI
 * @param {Object} feedback - Feedback object from analysis
 */
/**
 * Display pronunciation feedback in the UI
 * @param {Object} feedback - Feedback object from analysis
 */
export function displayPronunciationFeedback(feedback) {
    const { transcript, expected, score, problemWords, correctWords, totalWords } = feedback;
    
    // Handle problemWords - it might be an array of objects or strings
    let problemWordsArray = [];
    if (Array.isArray(problemWords)) {
        problemWordsArray = problemWords.map(word => {
            if (typeof word === 'string') return word;
            if (typeof word === 'object' && word !== null) return word.word || word.text || word.original || String(word);
            return String(word);
        }).filter(w => w && w.length > 0);
    }
    
    // Handle correctWords similarly
    let correctWordsArray = [];
    if (Array.isArray(correctWords)) {
        correctWordsArray = correctWords.map(word => {
            if (typeof word === 'string') return word;
            if (typeof word === 'object' && word !== null) return word.word || word.text || String(word);
            return String(word);
        }).filter(w => w && w.length > 0);
    }
    
    // Calculate total from arrays if not provided
    const totalWordCount = totalWords || (correctWordsArray.length + problemWordsArray.length);
    const matchedCount = correctWordsArray.length;
    
    // Update score display
    const scoreDisplay = document.getElementById('scoreDisplay');
    const scoreProgressBar = document.getElementById('scoreProgressBar');
    const wordsMatchedSpan = document.getElementById('wordsMatched');
    const totalWordsSpan = document.getElementById('totalWords');
    
    const displayScore = Math.round(score || 0);
    
    if (scoreDisplay) {
        scoreDisplay.textContent = `${displayScore}%`;
        scoreDisplay.className = `fw-bold fs-3 ${getScoreClassLocal(displayScore)}`;
    }
    
    if (scoreProgressBar) {
        scoreProgressBar.style.width = `${displayScore}%`;
        let barClass = 'progress-bar';
        if (displayScore >= 70) barClass += ' bg-success';
        else if (displayScore >= 50) barClass += ' bg-warning';
        else barClass += ' bg-danger';
        scoreProgressBar.className = barClass;
    }
    
    if (wordsMatchedSpan && totalWordsSpan) {
        wordsMatchedSpan.textContent = matchedCount;
        totalWordsSpan.textContent = totalWordCount;
    }
    
    // Highlight problem words in expected text
    let highlightedExpected = expected || '';
    if (problemWordsArray.length > 0) {
        problemWordsArray.forEach(word => {
            if (!word) return;
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedWord})`, 'gi');
            highlightedExpected = highlightedExpected.replace(regex, `<mark class="problem-word-highlight">$1</mark>`);
        });
    }
    
    // Show detailed feedback
    const feedbackText = document.getElementById('feedbackText');
    if (feedbackText) {
        let feedbackHtml = `
            <div class="comparison-view">
                <div class="expected-section mb-2 p-2 bg-light rounded">
                    <strong>📖 Expected:</strong>
                    <div class="mt-1">${highlightedExpected || 'No expected text'}</div>
                </div>
                <div class="user-section mb-2 p-2 bg-info bg-opacity-10 rounded">
                    <strong>🎤 You said:</strong>
                    <div class="mt-1">${escapeHtml(transcript || 'No speech detected')}</div>
                </div>
        `;
        
        if (score !== undefined && score !== null) {
            let message = '';
            if (displayScore >= 85) {
                message = '🎉 Excellent pronunciation! Keep up the great work!';
            } else if (displayScore >= 70) {
                message = '👍 Good job! A few words need practice.';
            } else if (displayScore >= 50) {
                message = '📖 Good effort. Listen carefully and try again.';
            } else {
                message = '💪 Keep practicing! Focus on the highlighted words.';
            }
            feedbackHtml += `<div class="feedback-message mt-2 text-center fw-bold">${message}</div>`;
        }
        
        feedbackHtml += `</div>`;
        feedbackText.innerHTML = feedbackHtml;
    }
    
    // Show problem words list
    const problemWordsContainer = document.getElementById('problemWords');
    if (problemWordsContainer) {
        if (problemWordsArray.length > 0) {
            problemWordsContainer.innerHTML = `
                <div class="alert alert-warning mt-2">
                    <strong>📝 Words to practice:</strong>
                    <div class="mt-2">
                        ${problemWordsArray.map(word => `<span class="badge bg-warning text-dark me-2 mb-2">${escapeHtml(word)}</span>`).join('')}
                    </div>
                </div>
            `;
        } else if (displayScore >= 85) {
            problemWordsContainer.innerHTML = `
                <div class="alert alert-success mt-2">
                    <strong>✨ Excellent!</strong> All words pronounced correctly!
                </div>
            `;
        } else if (transcript && transcript.length > 0) {
            problemWordsContainer.innerHTML = `
                <div class="alert alert-info mt-2">
                    <strong>💡 Tip:</strong> Listen carefully to the pronunciation and try again.
                </div>
            `;
        } else {
            problemWordsContainer.innerHTML = '';
        }
    }
    
    // Announce to screen reader
    if (score !== undefined && score !== null) {
        announceToScreenReader(`Pronunciation score: ${displayScore} percent. ${problemWordsArray.length > 0 ? `Practice these words: ${problemWordsArray.join(', ')}` : 'Excellent work!'}`);
    }
}

/**
 * Show recording status
 * @param {boolean} isRecording - Whether recording is active
 */
export function showRecordingStatus(isRecording) {
    const statusElement = document.getElementById('recording-status');
    const startBtn = document.getElementById('startListeningBtn');
    const stopBtn = document.getElementById('stopListeningBtn');
    
    if (statusElement) {
        statusElement.classList.remove('d-none');
        if (isRecording) {
            statusElement.className = 'mt-3 recording';
            statusElement.innerHTML = '<i class="bi bi-mic-fill"></i> Recording... Speak clearly';
            statusElement.setAttribute('aria-label', 'Recording in progress');
        } else {
            statusElement.className = 'mt-3';
            statusElement.innerHTML = '<i class="bi bi-check-circle-fill text-success"></i> Ready';
            setTimeout(() => {
                statusElement.classList.add('d-none');
            }, 3000);
        }
    }
    
    if (startBtn) startBtn.disabled = isRecording;
    if (stopBtn) stopBtn.disabled = !isRecording;
}

/**
 * Show live transcript during recording
 * @param {string} transcript - Interim transcript
 */
export function showLiveTranscript(transcript) {
    const liveTranscriptEl = document.getElementById('liveTranscript');
    if (liveTranscriptEl && transcript) {
        liveTranscriptEl.classList.remove('d-none');
        liveTranscriptEl.innerHTML = `<small class="text-muted">📝 ${escapeHtml(transcript)}</small>`;
    }
}

/**
 * Hide live transcript
 */
export function hideLiveTranscript() {
    const liveTranscriptEl = document.getElementById('liveTranscript');
    if (liveTranscriptEl) {
        liveTranscriptEl.classList.add('d-none');
        liveTranscriptEl.innerHTML = '';
    }
}

function setupGlobalListeners() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Optional: close top toast on escape
        }
    });

    window.addEventListener('resize', debounce(() => {
        // Adjust any UI elements that need it
    }, 250));
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Listen for pronunciation feedback events
document.addEventListener('pronunciation-feedback', (event) => {
    displayPronunciationFeedback(event.detail);
});

// ==================== DEFAULT EXPORT ====================

export default {
    createElement,
    createFragment,
    createTextElement,
    escapeHtml,
    escapeText,
    escapeAttr,
    sanitizeUrl,
    announceToScreenReader,
    createAnnouncer,
    renderFeedback,
    clearFeedback,
    showFeedbackError,
    updateScoreDisplay,
    getScoreClass: getScoreClassLocal,
    animateScoreChange,
    displayProblemWords,
    updateProblemWords,
    clearProblemWords,
    updateProgressBar,
    resetProgress,
    initProgressTracking,
    getProgressState,
    setProgressWeights,
    updateRecordingStatus,
    updateAudioLevel,
    resetRecordingStatus,
    getRecordingState,
    showLoading,
    hideLoading,
    updateLoadingProgress,
    withLoading,
    showSkeleton,
    showError,
    hideError,
    clearError,
    getFriendlyErrorMessage,
    showSuccess,
    showInfo,
    showWarning,
    showToastError,
    clearAllToasts,
    removeToastById,
    initUI,
    displayPronunciationFeedback,
    showRecordingStatus,
    showLiveTranscript,
    hideLiveTranscript
};