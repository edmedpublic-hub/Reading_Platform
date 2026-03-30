// static/reading/ui/components/feedback-display.js
// PURPOSE: Main feedback rendering component

import { updateScoreDisplay } from './score-display.js';
import { displayProblemWords } from './problem-words.js';
import { announceToScreenReader } from '../utils/screen-reader.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { createElement } from '../utils/dom-creator.js';

// Ensure styles are loaded
function ensureFeedbackStyles() {
    if (document.getElementById('feedback-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'feedback-styles';
    style.textContent = `
        .feedback-stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        .stat-item {
            text-align: center;
            padding: 0.75rem;
            border-radius: 8px;
            background: #f8f9fa;
        }
        .stat-value {
            display: block;
            font-size: 1.5rem;
            font-weight: bold;
        }
        .stat-label {
            font-size: 0.875rem;
            color: #666;
        }
        .correct-stat .stat-value { color: #28a745; }
        .incorrect-stat .stat-value { color: #dc3545; }
        .missing-stat .stat-value { color: #fd7e14; }
        .extra-stat .stat-value { color: #6c757d; }
        
        .feedback-section {
            margin-bottom: 1.5rem;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            overflow: hidden;
        }
        .section-title {
            margin: 0;
            padding: 0.75rem 1rem;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
        }
        .section-title .collapse-icon {
            float: right;
            transition: transform 0.2s;
        }
        .feedback-section.collapsed .feedback-list {
            display: none;
        }
        .feedback-section.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }
        
        .feedback-list {
            margin: 0;
            padding: 0.5rem 1rem 1rem;
            list-style: none;
        }
        .feedback-item {
            padding: 0.5rem;
            margin: 0.25rem 0;
            border-radius: 4px;
        }
        .word-pair {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }
        .expected-word { font-weight: 500; }
        .arrow { color: #6c757d; }
        .heard-word { 
            color: #dc3545;
            text-decoration: line-through;
        }
        
        .incorrect-item { background: rgba(220, 53, 69, 0.1); }
        .missing-item { background: rgba(253, 126, 20, 0.1); }
        .extra-item { background: rgba(108, 117, 125, 0.1); }
        .correct-item { background: rgba(40, 167, 69, 0.1); }
        
        .confidence-badge {
            display: inline-block;
            margin-left: 0.5rem;
            padding: 0.125rem 0.5rem;
            font-size: 0.75rem;
            border-radius: 12px;
            background: #e9ecef;
        }
        
        .feedback-perfect {
            text-align: center;
            padding: 2rem;
            background: #d4edda;
            border-radius: 8px;
        }
        
        .feedback-empty {
            text-align: center;
            padding: 2rem;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        /* RTL Support */
        [dir="rtl"] .section-title .collapse-icon {
            float: left;
        }
        [dir="rtl"] .word-pair {
            flex-direction: row-reverse;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Render pronunciation feedback in the UI
 * @param {Object} result - Analysis result from backend or reading.analysis.js
 * @param {Object} options - Configuration options
 * @returns {boolean} Success status
 */
export function renderFeedback(result, options = {}) {
    try {
        // Ensure styles exist
        ensureFeedbackStyles();
        
        // Default configuration
        const config = {
            scoreId: options.scoreId || 'readingScore',
            detailsId: options.detailsId || 'readingDetails',
            containerId: options.containerId || 'feedbackContainer',
            problemWordsId: options.problemWordsId || 'problemWordsContainer',
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
        const problemWordsEl = config.problemWordsId ?
            document.getElementById(config.problemWordsId) : null;

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

        // Check for Arabic content
        const hasArabic = [...correct, ...incorrect, ...missing, ...extra]
            .some(item => /[\u0600-\u06FF]/.test(JSON.stringify(item)));

        if (hasArabic && containerEl) {
            containerEl.setAttribute('dir', 'auto');
        }

        // Update score display (with error handling)
        try {
            if (scoreEl) {
                updateScoreDisplay(scoreEl, score, stats);
            }
        } catch (error) {
            console.error('Failed to update score display:', error);
        }

        // Display problem words if container exists
        if (problemWordsEl && (incorrect.length > 0 || missing.length > 0)) {
            try {
                displayProblemWords(problemWordsEl, { incorrect, missing });
            } catch (error) {
                console.error('Failed to display problem words:', error);
            }
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
            
            // Attach event listeners for collapsible sections
            attachCollapseListeners(detailsEl);
        }

        // Update container if provided
        if (containerEl) {
            containerEl.innerHTML = `
                <div class="feedback-score-section">${scoreEl?.outerHTML || ''}</div>
                <div class="feedback-details-section">${detailsHTML}</div>
            `;
            
            // Re-attach listeners after innerHTML update
            attachCollapseListeners(containerEl);
        }

        // Announce to screen readers
        if (config.announceToScreenReader) {
            announceToScreenReader(
                buildAnnouncement(score, correct.length, incorrect.length, missing.length),
                score < 70 ? 'assertive' : 'polite'
            );
        }

        // Dispatch event for other modules
        document.dispatchEvent(new CustomEvent('ui-feedback-rendered', {
            detail: { result, timestamp: Date.now() }
        }));

        return true;
        
    } catch (error) {
        console.error('renderFeedback failed:', error);
        return false;
    }
}

/**
 * Attach click listeners for collapsible sections
 * @param {HTMLElement} container - Container element
 */
function attachCollapseListeners(container) {
    if (!container) return;
    
    container.querySelectorAll('.section-title').forEach(title => {
        title.removeEventListener('click', toggleSection);
        title.addEventListener('click', toggleSection);
        
        // Keyboard support
        title.removeEventListener('keydown', handleSectionKeydown);
        title.addEventListener('keydown', handleSectionKeydown);
    });
}

function toggleSection(event) {
    const section = event.currentTarget.closest('.feedback-section');
    if (section) {
        section.classList.toggle('collapsed');
    }
}

function handleSectionKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleSection(event);
    }
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
                <span class="feedback-icon" aria-hidden="true">🌟</span>
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
            <div class="feedback-stats-grid" role="group" aria-label="Pronunciation statistics">
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
                        <span class="arrow" aria-hidden="true">→</span>
                        <span class="heard-word">${heard}</span>
                    </span>
                    ${confidence}
                </li>
            `;
        }).join('');

        sections.push(`
            <div class="feedback-section">
                <h4 class="section-title incorrect-title" tabindex="0" role="button" 
                    aria-expanded="true" aria-controls="incorrect-list">
                    <span class="title-icon" aria-hidden="true">⚠️</span>
                    Incorrect Words (${incorrect.length})
                    <span class="collapse-icon" aria-hidden="true">▼</span>
                </h4>
                <ul class="feedback-list" id="incorrect-list">${incorrectItems}</ul>
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
                <h4 class="section-title missing-title" tabindex="0" role="button"
                    aria-expanded="true" aria-controls="missing-list">
                    <span class="title-icon" aria-hidden="true">❓</span>
                    Missing Words (${missing.length})
                    <span class="collapse-icon" aria-hidden="true">▼</span>
                </h4>
                <ul class="feedback-list" id="missing-list">${missingItems}</ul>
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
                <h4 class="section-title extra-title" tabindex="0" role="button"
                    aria-expanded="true" aria-controls="extra-list">
                    <span class="title-icon" aria-hidden="true">➕</span>
                    Extra Words (${extra.length})
                    <span class="collapse-icon" aria-hidden="true">▼</span>
                </h4>
                <ul class="feedback-list" id="extra-list">${extraItems}</ul>
            </div>
        `);
    }

    // Correct words (collapsible if many)
    if (correct.length > 0) {
        if (correct.length < 20) {
            const correctItems = correct.map(item => {
                const word = escapeHtml(item.word || '');
                return `<li class="feedback-item correct-item">${word}</li>`;
            }).join('');

            sections.push(`
                <div class="feedback-section correct-section">
                    <h4 class="section-title correct-title" tabindex="0" role="button"
                        aria-expanded="true" aria-controls="correct-list">
                        <span class="title-icon" aria-hidden="true">✅</span>
                        Correct Words (${correct.length})
                        <span class="collapse-icon" aria-hidden="true">▼</span>
                    </h4>
                    <ul class="feedback-list" id="correct-list">${correctItems}</ul>
                </div>
            `);
        } else {
            sections.push(`
                <div class="feedback-section correct-section">
                    <h4 class="section-title correct-title">
                        <span class="title-icon" aria-hidden="true">✅</span>
                        Correct Words (${correct.length})
                    </h4>
                    <div class="feedback-summary">
                        <p class="feedback-item">All ${correct.length} words correct ✓</p>
                    </div>
                </div>
            `);
        }
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
    const roundedScore = Math.round(score);
    let message = `Score ${roundedScore} percent. `;
    
    if (correct > 0) message += `${correct} words correct. `;
    if (incorrect > 0) message += `${incorrect} words incorrect. `;
    if (missing > 0) message += `${missing} words missing. `;
    
    if (roundedScore >= 90) message += 'Excellent pronunciation!';
    else if (roundedScore >= 70) message += 'Good job, keep practicing.';
    else if (roundedScore > 0) message += 'Keep practicing for improvement.';
    
    return message;
}

/**
 * Clear feedback display
 * @param {Object} options - Which elements to clear
 */
export function clearFeedback(options = {}) {
    const {
        scoreId = 'readingScore',
        detailsId = 'readingDetails',
        containerId = 'feedbackContainer',
        problemWordsId = 'problemWordsContainer'
    } = options;
    
    const scoreEl = document.getElementById(scoreId);
    const detailsEl = document.getElementById(detailsId);
    const containerEl = document.getElementById(containerId);
    const problemWordsEl = document.getElementById(problemWordsId);
    
    if (scoreEl) scoreEl.innerHTML = '';
    if (detailsEl) detailsEl.innerHTML = '';
    if (containerEl) containerEl.innerHTML = '';
    if (problemWordsEl) problemWordsEl.innerHTML = '';
}

/**
 * Show error in feedback area
 * @param {string} message - Error message
 * @param {string} containerId - Container element ID
 */
export function showFeedbackError(message, containerId = 'feedbackContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <div class="feedback-error" role="alert">
            <span class="error-icon" aria-hidden="true">❌</span>
            <p class="error-message">${escapeHtml(message)}</p>
        </div>
    `;
    
    announceToScreenReader(`Error: ${message}`, 'assertive');
}