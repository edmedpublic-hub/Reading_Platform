// static/reading/reading.ui.js
// PURPOSE: Pure UI rendering utilities for feedback display and progress tracking
// DEPENDENCIES: None (pure DOM manipulation)
// EXPORTS: renderFeedback, showLoading, showError, showSuccess, createElement, updateProgressBar, resetProgress

/* ===== NEW: Progress Bar State ===== */
let progressState = {
    ttsProgress: 0,
    practiceProgress: 0,
    overallProgress: 0,
    mode: 'tts' // 'tts', 'practice', or 'combined'
};
/* ===== END NEW ===== */

/**
 * Render pronunciation feedback in the UI
 * @param {Object} result - Analysis result from backend or reading.analysis.js
 * @param {Object} options - Configuration options
 * @returns {boolean} Success status
 */
export function renderFeedback(result, options = {}) {
    // Default configuration
    const config = {
        scoreId: options.scoreId || 'readingScore',
        detailsId: options.detailsId || 'readingDetails',
        containerId: options.containerId || 'feedbackContainer',
        showEmptyState: options.showEmptyState !== false,
        announceToScreenReader: options.announceToScreenReader !== false,
        ...options
    };

    // Validate result
    if (!result || typeof result !== 'object') {
        console.error('renderFeedback: Invalid result object');
        return false;
    }

    // Get DOM elements
    const scoreEl = document.getElementById(config.scoreId);
    const detailsEl = document.getElementById(config.detailsId);
    const containerEl = config.containerId ? 
        document.getElementById(config.containerId) : null;

    if (!scoreEl && !detailsEl && !containerEl) {
        console.warn('renderFeedback: No target elements found');
        return false;
    }

    // Extract data with safe defaults
    const stats = result.stats || {};
    const score = stats.weightedScore || stats.accuracy || result.score || 0;
    const correct = Array.isArray(result.correct) ? result.correct : [];
    const incorrect = Array.isArray(result.incorrect) ? result.incorrect : [];
    const missing = Array.isArray(result.missing) ? result.missing : [];
    const extra = Array.isArray(result.extra) ? result.extra : [];

    // Update score display
    if (scoreEl) {
        updateScoreDisplay(scoreEl, score, stats);
    }

    // Build details HTML
    const detailsHTML = buildDetailsHTML({
        correct,
        incorrect,
        missing,
        extra,
        stats,
        showEmptyState: config.showEmptyState
    });

    // Update details element
    if (detailsEl) {
        detailsEl.innerHTML = detailsHTML;
    }

    // Update container if provided
    if (containerEl) {
        containerEl.innerHTML = `
            <div class="feedback-score-section">${scoreEl?.outerHTML || ''}</div>
            <div class="feedback-details-section">${detailsHTML}</div>
        `;
    }

    // Announce to screen readers
    if (config.announceToScreenReader) {
        announceToScreenReader(buildAnnouncement(score, correct.length, incorrect.length, missing.length));
    }

    // Dispatch event for other modules
    document.dispatchEvent(new CustomEvent('ui-feedback-rendered', {
        detail: { result, timestamp: Date.now() }
    }));

    return true;
}

/**
 * Update score display with appropriate formatting
 * @param {HTMLElement} element - Score element
 * @param {number} score - Score value
 * @param {Object} stats - Additional statistics
 */
function updateScoreDisplay(element, score, stats) {
    // Format score
    const formattedScore = typeof score === 'number' ? 
        score.toFixed(1) : parseFloat(score).toFixed(1);
    
    // Determine color class based on score
    let colorClass = 'score-low';
    if (score >= 80) colorClass = 'score-high';
    else if (score >= 60) colorClass = 'score-medium';
    
    // Build score HTML
    element.innerHTML = `
        <div class="score-display ${colorClass}">
            <span class="score-value">${formattedScore}%</span>
            <span class="score-label">Overall Accuracy</span>
        </div>
    `;
    
    // Add ARIA label
    element.setAttribute('aria-label', `Score: ${formattedScore} percent`);
}

/**
 * Build HTML for feedback details
 * @param {Object} data - Feedback data
 * @returns {string} HTML string
 */
function buildDetailsHTML(data) {
    const {
        correct = [],
        incorrect = [],
        missing = [],
        extra = [],
        stats = {},
        showEmptyState = true
    } = data;

    // If everything is perfect
    if (correct.length > 0 && 
        incorrect.length === 0 && 
        missing.length === 0 && 
        extra.length === 0) {
        return `
            <div class="feedback-perfect" role="status" aria-live="polite">
                <span class="feedback-icon">🌟</span>
                <p class="feedback-message">Perfect! No errors found.</p>
                <p class="feedback-detail">You read all ${correct.length} words correctly.</p>
            </div>
        `;
    }

    // If no data and show empty state
    if (correct.length === 0 && 
        incorrect.length === 0 && 
        missing.length === 0 && 
        extra.length === 0 && 
        showEmptyState) {
        return `
            <div class="feedback-empty" role="status">
                <p class="text-muted">No pronunciation data available.</p>
                <p class="text-muted-small">Try speaking into the microphone.</p>
            </div>
        `;
    }

    const sections = [];

    // Statistics summary
    if (Object.keys(stats).length > 0) {
        sections.push(`
            <div class="feedback-stats-grid">
                <div class="stat-item correct-stat">
                    <span class="stat-value">${stats.correct || 0}</span>
                    <span class="stat-label">Correct</span>
                </div>
                <div class="stat-item incorrect-stat">
                    <span class="stat-value">${stats.incorrect || 0}</span>
                    <span class="stat-label">Incorrect</span>
                </div>
                <div class="stat-item missing-stat">
                    <span class="stat-value">${stats.missing || 0}</span>
                    <span class="stat-label">Missing</span>
                </div>
                <div class="stat-item extra-stat">
                    <span class="stat-value">${stats.extra || 0}</span>
                    <span class="stat-label">Extra</span>
                </div>
            </div>
        `);
    }

    // Incorrect words section
    if (incorrect.length > 0) {
        const incorrectItems = incorrect.map(item => {
            const expected = escapeHtml(item.expected || item.word || '');
            const heard = escapeHtml(item.heard || item.said || '');
            const confidence = item.confidence ? 
                `<span class="confidence-badge">${Math.round(item.confidence * 100)}% match</span>` : '';
            
            return `
                <li class="feedback-item incorrect-item">
                    <span class="word-pair">
                        <span class="expected-word">${expected}</span>
                        <span class="arrow">→</span>
                        <span class="heard-word">${heard}</span>
                    </span>
                    ${confidence}
                </li>
            `;
        }).join('');

        sections.push(`
            <div class="feedback-section">
                <h4 class="section-title incorrect-title">
                    <span class="title-icon">⚠️</span>
                    Incorrect Words (${incorrect.length})
                </h4>
                <ul class="feedback-list">${incorrectItems}</ul>
            </div>
        `);
    }

    // Missing words section
    if (missing.length > 0) {
        const missingItems = missing.map(item => {
            const word = escapeHtml(item.word || '');
            return `<li class="feedback-item missing-item">${word}</li>`;
        }).join('');

        sections.push(`
            <div class="feedback-section">
                <h4 class="section-title missing-title">
                    <span class="title-icon">❓</span>
                    Missing Words (${missing.length})
                </h4>
                <ul class="feedback-list">${missingItems}</ul>
            </div>
        `);
    }

    // Extra words section
    if (extra.length > 0) {
        const extraItems = extra.map(item => {
            const word = escapeHtml(item.word || '');
            return `<li class="feedback-item extra-item">${word}</li>`;
        }).join('');

        sections.push(`
            <div class="feedback-section">
                <h4 class="section-title extra-title">
                    <span class="title-icon">➕</span>
                    Extra Words (${extra.length})
                </h4>
                <ul class="feedback-list">${extraItems}</ul>
            </div>
        `);
    }

    // Correct words (collapsible if many)
    if (correct.length > 0 && correct.length < 20) {
        const correctItems = correct.map(item => {
            const word = escapeHtml(item.word || '');
            return `<li class="feedback-item correct-item">${word}</li>`;
        }).join('');

        sections.push(`
            <div class="feedback-section correct-section">
                <h4 class="section-title correct-title">
                    <span class="title-icon">✅</span>
                    Correct Words (${correct.length})
                </h4>
                <ul class="feedback-list correct-list">${correctItems}</ul>
            </div>
        `);
    } else if (correct.length >= 20) {
        sections.push(`
            <div class="feedback-section correct-section collapsed">
                <h4 class="section-title correct-title" role="button" tabindex="0" 
                    onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="title-icon">✅</span>
                    Correct Words (${correct.length})
                    <span class="collapse-icon">▼</span>
                </h4>
                <ul class="feedback-list correct-list">
                    <li class="feedback-item">${correct.length} words correct</li>
                </ul>
            </div>
        `);
    }

    return sections.join('\n');
}

/**
 * Build screen reader announcement
 * @param {number} score - Score percentage
 * @param {number} correct - Correct count
 * @param {number} incorrect - Incorrect count
 * @param {number} missing - Missing count
 * @returns {string} Announcement text
 */
function buildAnnouncement(score, correct, incorrect, missing) {
    return `Score ${Math.round(score)} percent. ` +
           `${correct} words correct, ` +
           `${incorrect} words incorrect, ` +
           `${missing} words missing.`;
}

/**
 * Announce message to screen readers
 * @param {string} message - Message to announce
 */
function announceToScreenReader(message) {
    // Get or create announcer element
    let announcer = document.getElementById('sr-announcer');
    
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'sr-announcer';
        announcer.className = 'sr-only';
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        document.body.appendChild(announcer);
    }
    
    // Set message (this triggers screen reader)
    announcer.textContent = message;
}

/**
 * Show loading indicator
 * @param {string} message - Loading message
 * @param {string} containerId - Container element ID
 */
export function showLoading(message = 'Loading...', containerId = 'feedbackContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="loading-indicator" role="status" aria-live="polite">
            <div class="spinner"></div>
            <p class="loading-message">${escapeHtml(message)}</p>
        </div>
    `;
}

/**
 * Show error message
 * @param {string} message - Error message
 * @param {string} containerId - Container element ID
 * @param {Function} retryCallback - Optional retry function
 */
/**
 * Show user-friendly error message (classroom-optimized)
 * @param {string} message - Technical error message
 * @param {string} containerId - Container element ID
 * @param {Function} retryCallback - Optional retry function
 */
export function showError(message, containerId = 'feedbackContainer', retryCallback = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Convert technical messages to classroom-friendly ones
    const friendlyError = getFriendlyErrorMessage(message);
    
    const retryButton = retryCallback ? 
        `<button class="btn-retry" onclick="(${retryCallback.toString()})()">Try Again</button>` : '';

    container.innerHTML = `
        <div class="classroom-error" role="alert" aria-live="assertive">
            <div class="error-icon">${friendlyError.icon}</div>
            <div class="error-content">
                <h4 class="error-title">${friendlyError.title}</h4>
                <p class="error-message">${friendlyError.mainMessage}</p>
                <ul class="error-tips">
                    ${friendlyError.tips.map(tip => `<li>✓ ${tip}</li>`).join('')}
                </ul>
                <div class="error-actions">
                    ${retryButton}
                    <button class="btn-help" onclick="window.location.href='/help/'">Get Help</button>
                </div>
            </div>
        </div>
    `;
    
    // Log for teachers (invisible to students)
    console.log('📝 Classroom error logged:', friendlyError.logMessage);
}

/**
 * Convert technical errors to classroom-friendly messages
 */
function getFriendlyErrorMessage(technical) {
    const error = String(technical).toLowerCase();
    
    // Network/Connection errors
    if (error.includes('network') || error.includes('fetch') || error.includes('connection')) {
        return {
            icon: '📶',
            title: 'Connection Issue',
            mainMessage: "We're having trouble connecting to the lesson.",
            tips: [
                'Check your internet connection',
                'Wait a moment and try again',
                'Ask your teacher for help'
            ],
            logMessage: 'Network error - student may have connectivity issues'
        };
    }
    
    // Server errors (500, 503)
    if (error.includes('500') || error.includes('503') || error.includes('server')) {
        return {
            icon: '🔧',
            title: 'Technical Glitch',
            mainMessage: "Our system hit a small bump. Don't worry!",
            tips: [
                'Try again in a minute',
                'Your progress is safely saved',
                'Tell your teacher if this keeps happening'
            ],
            logMessage: 'Server error -可能需要技术团队注意'
        };
    }
    
    // Permission errors (microphone)
    if (error.includes('microphone') || error.includes('permission') || error.includes('denied')) {
        return {
            icon: '🎤',
            title: 'Microphone Access Needed',
            mainMessage: "We can't hear you yet.",
            tips: [
                'Click the microphone icon in your browser',
                'Select "Allow" when asked',
                'Refresh the page after allowing'
            ],
            logMessage: 'Microphone permission denied'
        };
    }
    
    // No speech detected
    if (error.includes('no speech') || error.includes('silence')) {
        return {
            icon: '🔇',
            title: 'No Speech Detected',
            mainMessage: "We didn't hear anything.",
            tips: [
                'Make sure your microphone is on',
                'Speak clearly into the microphone',
                'Try moving closer to your device'
            ],
            logMessage: 'No speech detected during recording'
        };
    }
    
    // Lesson loading errors
    if (error.includes('lesson') || error.includes('404') || error.includes('not found')) {
        return {
            icon: '📚',
            title: 'Lesson Unavailable',
            mainMessage: "This lesson can't be opened right now.",
            tips: [
                'Check that the lesson ID is correct',
                'Try a different lesson',
                'Ask your teacher for help'
            ],
            logMessage: `Lesson not found: ${technical}`
        };
    }
    
    // Default fallback
    return {
        icon: '❓',
        title: 'Something Unexpected Happened',
        mainMessage: "Don't worry - these things happen!",
        tips: [
            'Try refreshing the page',
            'Come back to it in a few minutes',
            'Your teacher has been notified'
        ],
        logMessage: `Unhandled error: ${technical}`
    };
}

/**
 * Show success message
 * @param {string} message - Success message
 * @param {string} containerId - Container element ID
 */
export function showSuccess(message, containerId = 'feedbackContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="success-message" role="status" aria-live="polite">
            <span class="success-icon">✅</span>
            <p class="success-text">${escapeHtml(message)}</p>
        </div>
    `;
}

/**
 * Create DOM element with attributes and children
 * @param {string} tag - HTML tag
 * @param {Object} attributes - Element attributes
 * @param {Array|string} children - Child elements or text
 * @returns {HTMLElement} Created element
 */
export function createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Append children
    if (typeof children === 'string') {
        element.textContent = children;
    } else if (Array.isArray(children)) {
        children.forEach(child => {
            if (child instanceof HTMLElement) {
                element.appendChild(child);
            } else if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            }
        });
    }
    
    return element;
}

/**
 * Escape HTML to prevent XSS
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
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#047;');
}

/**
 * Clear feedback display
 * @param {string} containerId - Container element ID
 */
export function clearFeedback(containerId = 'feedbackContainer') {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '';
    }
    
    // Also clear individual elements if they exist
    const scoreEl = document.getElementById('readingScore');
    const detailsEl = document.getElementById('readingDetails');
    
    if (scoreEl) scoreEl.innerHTML = '';
    if (detailsEl) detailsEl.innerHTML = '';
}

/**
 * Update recording status indicator
 * @param {boolean} isRecording - Whether recording is active
 * @param {string} statusId - Status element ID
 */
export function updateRecordingStatus(isRecording, statusId = 'recording-status') {
    const statusEl = document.getElementById(statusId);
    if (!statusEl) return;
    
    if (isRecording) {
        statusEl.innerHTML = `
            <span class="recording-indicator active" role="status" aria-live="polite">
                <span class="recording-dot"></span>
                Recording... Speak now
            </span>
        `;
        statusEl.classList.remove('d-none');
    } else {
        statusEl.innerHTML = '';
        statusEl.classList.add('d-none');
    }
}

/* ===== NEW: Progress Bar Functions ===== */

/**
 * Update progress bar based on TTS or practice progress
 * @param {string} mode - 'tts', 'practice', or 'combined'
 * @param {number} value - Progress value (0-100)
 */
export function updateProgressBar(mode, value) {
    const progressBar = document.getElementById('readingProgressBar');
    if (!progressBar) return;
    
    // Update state based on mode
    if (mode === 'tts') {
        progressState.ttsProgress = value;
    } else if (mode === 'practice') {
        progressState.practiceProgress = value;
    }
    
    // Calculate overall progress (weighted average)
    // TTS: 30% weight, Practice: 70% weight (practice is more important)
    progressState.overallProgress = 
        (progressState.ttsProgress * 0.3) + 
        (progressState.practiceProgress * 0.7);
    
    // Update the DOM
    const displayValue = Math.round(progressState.overallProgress);
    progressBar.style.width = `${displayValue}%`;
    progressBar.setAttribute('aria-valuenow', displayValue);
    progressBar.innerHTML = `<span class="visually-hidden">${displayValue}% complete</span>`;
    
    // Change color based on progress
    progressBar.className = 'progress-bar progress-bar-striped';
    if (displayValue >= 80) {
        progressBar.classList.add('bg-success');
    } else if (displayValue >= 50) {
        progressBar.classList.add('bg-info');
    } else if (displayValue >= 25) {
        progressBar.classList.add('bg-warning');
    } else {
        progressBar.classList.add('bg-primary');
    }
    
    // Dispatch event for other modules
    document.dispatchEvent(new CustomEvent('progress-updated', {
        detail: { 
            tts: progressState.ttsProgress,
            practice: progressState.practiceProgress,
            overall: progressState.overallProgress,
            mode
        }
    }));
}

/**
 * Reset progress bar to zero
 */
export function resetProgress() {
    progressState = {
        ttsProgress: 0,
        practiceProgress: 0,
        overallProgress: 0,
        mode: 'tts'
    };
    updateProgressBar('tts', 0);
}

/**
 * Initialize progress bar event listeners
 * Call this once when the app starts
 */
export function initProgressTracking() {
    // Listen for TTS progress events from reading.text.js
    document.addEventListener('tts-progress', (event) => {
        const { progress } = event.detail;
        updateProgressBar('tts', progress);
    });
    
    // Listen for practice progress events (will be added later)
    document.addEventListener('practice-progress', (event) => {
        const { progress } = event.detail;
        updateProgressBar('practice', progress);
    });
    
    console.log('Progress tracking initialized');
}

/* ===== END NEW ===== */

// Export default object with all functions (UPDATED)
export default {
    renderFeedback,
    showLoading,
    showError,
    showSuccess,
    clearFeedback,
    createElement,
    updateRecordingStatus,
    updateProgressBar,      // NEW
    resetProgress,          // NEW
    initProgressTracking    // NEW
};