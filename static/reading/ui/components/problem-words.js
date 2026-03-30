// static/reading/ui/components/problem-words.js
// PURPOSE: Display interactive list of problem words from feedback

import { escapeHtml } from '../utils/html-escaper.js';
import { createElement } from '../utils/dom-creator.js';
import { announceToScreenReader } from '../utils/screen-reader.js';

// Ensure styles are loaded
function ensureProblemWordsStyles() {
    if (document.getElementById('problem-words-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'problem-words-styles';
    style.textContent = `
        .problem-words-container {
            margin: 1rem 0;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            overflow: hidden;
        }
        
        .problem-words-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 1rem;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        
        .problem-words-title {
            margin: 0;
            font-size: 1rem;
            font-weight: 600;
            color: #495057;
        }
        
        .problem-words-count {
            background: #dc3545;
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.875rem;
            font-weight: 500;
        }
        
        .problem-words-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        
        .problem-words-category {
            padding: 0.5rem 1rem;
            background: #fff;
        }
        
        .category-header {
            margin: 0.5rem 0;
            font-size: 0.875rem;
            font-weight: 600;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .problem-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 1rem;
            margin: 0.25rem 0;
            background: #f8f9fa;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .problem-item:hover {
            background: #e9ecef;
            transform: translateX(4px);
        }
        
        .problem-item:focus {
            outline: 2px solid #007bff;
            outline-offset: 2px;
        }
        
        .problem-item.incorrect {
            border-left: 4px solid #dc3545;
        }
        
        .problem-item.missing {
            border-left: 4px solid #fd7e14;
        }
        
        .problem-item.extra {
            border-left: 4px solid #6c757d;
        }
        
        .word-display {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        
        .expected-word {
            font-weight: 600;
            color: #212529;
        }
        
        .heard-word {
            color: #dc3545;
            text-decoration: line-through;
            font-size: 0.875rem;
        }
        
        .missing-label {
            color: #fd7e14;
            font-weight: 500;
            font-size: 0.875rem;
        }
        
        .extra-label {
            color: #6c757d;
            font-weight: 500;
            font-size: 0.875rem;
        }
        
        .arrow {
            color: #adb5bd;
            margin: 0 0.25rem;
        }
        
        .practice-button {
            padding: 0.25rem 0.75rem;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 0.75rem;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
        }
        
        .problem-item:hover .practice-button {
            opacity: 1;
        }
        
        .practice-button:hover {
            background: #0056b3;
        }
        
        .practice-button:focus {
            outline: 2px solid #fff;
            outline-offset: 2px;
        }
        
        .empty-state {
            text-align: center;
            padding: 2rem;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        .empty-state.success {
            color: #28a745;
            font-weight: 500;
        }
        
        /* RTL Support */
        [dir="rtl"] .problem-item:hover {
            transform: translateX(-4px);
        }
        
        [dir="rtl"] .problem-item {
            border-left: none;
            border-right: 4px solid transparent;
        }
        
        [dir="rtl"] .problem-item.incorrect {
            border-right-color: #dc3545;
        }
        
        [dir="rtl"] .problem-item.missing {
            border-right-color: #fd7e14;
        }
        
        [dir="rtl"] .problem-item.extra {
            border-right-color: #6c757d;
        }
        
        [dir="rtl"] .word-display {
            flex-direction: row-reverse;
        }
        
        [dir="rtl"] .arrow {
            transform: scaleX(-1);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Display problem words in the UI
 * @param {HTMLElement|string} container - Container element or ID
 * @param {Object} feedbackData - Complete feedback data
 * @param {Object} options - Configuration options
 * @param {boolean} options.showPracticeButtons - Show practice buttons
 * @param {Function} options.onPracticeWord - Callback when practice clicked
 */
export function displayProblemWords(container, feedbackData = {}, options = {}) {
    // Get container element
    const containerEl = typeof container === 'string' 
        ? document.getElementById(container) 
        : container;
    
    if (!containerEl) {
        console.error('displayProblemWords: Container not found');
        return;
    }

    // Ensure styles exist
    ensureProblemWordsStyles();

    // Check for RTL (Arabic)
    const feedbackString = JSON.stringify(feedbackData);
    const hasArabic = /[\u0600-\u06FF]/.test(feedbackString);
    if (hasArabic) {
        containerEl.setAttribute('dir', 'auto');
    }

    // Extract problem categories
    const incorrect = feedbackData.incorrect || [];
    const missing = feedbackData.missing || [];
    const extra = feedbackData.extra || [];
    
    const totalProblems = incorrect.length + missing.length + extra.length;

    // Clear container
    containerEl.innerHTML = '';

    // Empty state
    if (totalProblems === 0) {
        containerEl.appendChild(createElement('div', {
            className: 'empty-state success'
        }, [
            createElement('span', { className: 'success-icon' }, '✅'),
            createElement('p', {}, 'No errors found! Great job!')
        ]));
        return;
    }

    // Create container
    const problemsContainer = createElement('div', { className: 'problem-words-container' });

    // Header with count
    problemsContainer.appendChild(createElement('div', { className: 'problem-words-header' }, [
        createElement('h4', { className: 'problem-words-title' }, 'Words to Practice'),
        createElement('span', { className: 'problem-words-count' }, totalProblems)
    ]));

    // Create list
    const listEl = createElement('ul', { className: 'problem-words-list' });

    // Add incorrect words (mispronounced)
    if (incorrect.length > 0) {
        listEl.appendChild(createCategoryHeader('Mispronounced', incorrect.length));
        
        incorrect.forEach((item, index) => {
            const listItem = createProblemItem('incorrect', item, index, options);
            listEl.appendChild(listItem);
        });
    }

    // Add missing words
    if (missing.length > 0) {
        listEl.appendChild(createCategoryHeader('Missing', missing.length));
        
        missing.forEach((item, index) => {
            const listItem = createProblemItem('missing', item, index, options);
            listEl.appendChild(listItem);
        });
    }

    // Add extra words
    if (extra.length > 0) {
        listEl.appendChild(createCategoryHeader('Extra', extra.length));
        
        extra.forEach((item, index) => {
            const listItem = createProblemItem('extra', item, index, options);
            listEl.appendChild(listItem);
        });
    }

    problemsContainer.appendChild(listEl);
    containerEl.appendChild(problemsContainer);

    // Announce to screen readers
    announceToScreenReader(
        `Found ${totalProblems} words to practice. ` +
        `${incorrect.length} mispronounced, ${missing.length} missing, ${extra.length} extra.`
    );
}

/**
 * Create category header
 */
function createCategoryHeader(title, count) {
    return createElement('li', { className: 'problem-words-category' }, [
        createElement('div', { className: 'category-header' }, `${title} (${count})`)
    ]);
}

/**
 * Create problem item
 */
function createProblemItem(type, item, index, options) {
    const {
        showPracticeButtons = true,
        onPracticeWord = null
    } = options;

    const itemEl = createElement('li', {
        className: `problem-item ${type}`,
        tabindex: '0',
        role: 'listitem',
        'data-type': type,
        'data-index': index,
        'aria-label': getAriaLabel(type, item)
    });

    // Word display
    const wordDisplay = createElement('div', { className: 'word-display' });

    switch (type) {
        case 'incorrect':
            wordDisplay.appendChildren([
                createElement('span', { className: 'expected-word' }, escapeHtml(item.expected || item.word)),
                createElement('span', { className: 'arrow' }, '→'),
                createElement('span', { className: 'heard-word' }, escapeHtml(item.heard || ''))
            ]);
            break;
            
        case 'missing':
            wordDisplay.appendChildren([
                createElement('span', { className: 'missing-label' }, 'Missing:'),
                createElement('span', { className: 'expected-word' }, escapeHtml(item.word || ''))
            ]);
            break;
            
        case 'extra':
            wordDisplay.appendChildren([
                createElement('span', { className: 'extra-label' }, 'Extra:'),
                createElement('span', { className: 'expected-word' }, escapeHtml(item.word || ''))
            ]);
            break;
    }

    itemEl.appendChild(wordDisplay);

    // Practice button
    if (showPracticeButtons && onPracticeWord) {
        const practiceBtn = createElement('button', {
            className: 'practice-button',
            onclick: (e) => {
                e.stopPropagation();
                onPracticeWord(type, item);
            }
        }, 'Practice');
        
        itemEl.appendChild(practiceBtn);
    }

    // Click handler for practice
    if (onPracticeWord) {
        itemEl.addEventListener('click', () => {
            onPracticeWord(type, item);
        });

        // Keyboard support
        itemEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPracticeWord(type, item);
            }
        });
    }

    return itemEl;
}

/**
 * Get ARIA label for screen readers
 */
function getAriaLabel(type, item) {
    switch (type) {
        case 'incorrect':
            return `You said "${item.heard}" instead of "${item.expected}"`;
        case 'missing':
            return `Missing word: ${item.word}`;
        case 'extra':
            return `Extra word: ${item.word}`;
        default:
            return 'Problem word';
    }
}

/**
 * Update problem words with new feedback
 * @param {string} containerId - Container ID
 * @param {Object} feedbackData - New feedback data
 */
export function updateProblemWords(containerId, feedbackData) {
    const container = document.getElementById(containerId);
    if (container) {
        displayProblemWords(container, feedbackData);
    }
}

/**
 * Clear problem words display
 * @param {string} containerId - Container ID
 */
export function clearProblemWords(containerId = 'problemWordsContainer') {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '';
    }
}

export default {
    displayProblemWords,
    updateProblemWords,
    clearProblemWords
};