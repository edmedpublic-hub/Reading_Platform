// static/reading/highlighting/utils/highlight-utils.js
// PURPOSE: Utility functions for highlighting with comprehensive support

// Highlight type to class mapping
export const HIGHLIGHT_CLASSES = {
    correct: 'highlight-correct',
    incorrect: 'highlight-incorrect',
    missing: 'highlight-missing',
    extra: 'highlight-extra',
    active: 'highlight-active',
    current: 'highlight-current'
};

// Highlight type to color mapping (for inline styles if needed)
export const HIGHLIGHT_COLORS = {
    correct: '#28a745',
    incorrect: '#dc3545',
    missing: '#fd7e14',
    extra: '#6c757d',
    active: '#ffc107',
    current: '#007bff'
};

// Highlight type to ARIA labels
export const HIGHLIGHT_LABELS = {
    correct: { en: 'correctly read', ar: 'صحيحة' },
    incorrect: { en: 'incorrectly pronounced', ar: 'غير صحيحة' },
    missing: { en: 'missing word', ar: 'كلمة ناقصة' },
    extra: { en: 'extra word', ar: 'كلمة زائدة' },
    active: { en: 'currently reading', ar: 'جار القراءة' },
    current: { en: 'current position', ar: 'الموضع الحالي' }
};

/**
 * Normalize text for comparison
 * @param {string} text - Text to normalize
 * @param {Object} options - Normalization options
 * @param {boolean} options.preserveArabic - Whether to preserve Arabic honorifics
 * @param {boolean} options.ignoreCase - Whether to ignore case
 * @param {boolean} options.ignorePunctuation - Whether to ignore punctuation
 * @returns {string} Normalized text
 */
export function normalizeForComparison(text, options = {}) {
    const {
        preserveArabic = true,
        ignoreCase = true,
        ignorePunctuation = true
    } = options;
    
    if (!text) return '';
    
    let normalized = String(text);
    
    const hasArabic = /[\u0600-\u06FF]/.test(normalized);
    
    if (hasArabic && preserveArabic) {
        // For Arabic, just normalize spaces and remove honorifics if needed
        normalized = normalized.replace(/\{[^}]+\}/g, ''); // Remove honorifics for comparison
        normalized = normalized.replace(/\s+/g, ' ').trim();
    } else {
        // For English or Arabic without honorific preservation
        if (ignoreCase) {
            normalized = normalized.toLowerCase();
        }
        if (ignorePunctuation) {
            normalized = normalized.replace(/[.,!?;:()\[\]{}"'-]/g, ' ');
        }
        normalized = normalized.replace(/\s+/g, ' ').trim();
    }
    
    return normalized;
}

/**
 * Split text while preserving whitespace
 * @param {string} text - Text to split
 * @returns {Array} Array of words and whitespace
 */
export function splitPreservingWhitespace(text) {
    if (!text) return [];
    
    const parts = [];
    let current = '';
    let inWord = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isWhitespace = /\s/.test(char);
        
        if (isWhitespace !== inWord && current) {
            parts.push(current);
            current = '';
        }
        
        current += char;
        inWord = !isWhitespace;
    }
    
    if (current) parts.push(current);
    return parts;
}

/**
 * Get all text nodes within an element
 * @param {HTMLElement} element - Container element
 * @param {Object} options - Filter options
 * @param {boolean} options.includeScripts - Include script/style content
 * @returns {Array} Array of text nodes
 */
export function getTextNodes(element, options = {}) {
    const { includeScripts = false } = options;
    const nodes = [];
    
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            if (!includeScripts) {
                const parent = node.parentElement;
                if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
                    return NodeFilter.FILTER_REJECT;
                }
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }
    return nodes;
}

/**
 * Get character positions for words in text
 * @param {HTMLElement} container - Container element
 * @param {string} text - Full text
 * @param {Array} words - Words to locate
 * @returns {Array} Word positions with start/end indices
 */
export function getWordPositions(container, text, words) {
    const positions = [];
    const textNodes = getTextNodes(container);
    let globalIndex = 0;
    
    textNodes.forEach(node => {
        const nodeText = node.textContent || '';
        const nodeLength = nodeText.length;
        
        // Find words in this node
        words.forEach((word, wordIndex) => {
            const wordText = typeof word === 'string' ? word : word.text || word.word || '';
            if (!wordText) return;
            
            const localIndex = nodeText.indexOf(wordText);
            if (localIndex >= 0) {
                positions.push({
                    word: wordText,
                    node,
                    start: globalIndex + localIndex,
                    end: globalIndex + localIndex + wordText.length,
                    type: word.type || word.status || 'unknown',
                    index: wordIndex
                });
            }
        });
        
        globalIndex += nodeLength;
    });
    
    return positions;
}

/**
 * Check if element is in viewport
 * @param {HTMLElement} element - Element to check
 * @param {number} offset - Offset from viewport edge
 * @returns {boolean} Whether element is in viewport
 */
export function isInViewport(element, offset = 0) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    return (
        rect.top >= offset &&
        rect.left >= offset &&
        rect.bottom <= windowHeight - offset &&
        rect.right <= windowWidth - offset
    );
}

/**
 * Get scroll position for element
 * @param {HTMLElement} element - Element to scroll to
 * @param {Object} options - Scroll options
 * @param {string} options.block - 'start', 'center', 'end', 'nearest'
 * @param {boolean} options.rtl - Whether text is RTL
 * @returns {Object} Scroll position { top, left, behavior }
 */
export function getScrollPosition(element, options = {}) {
    const {
        block = 'center',
        rtl = false
    } = options;
    
    if (!element) return { top: 0, left: 0 };
    
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    
    let top = window.scrollY + rect.top;
    let left = window.scrollX + rect.left;
    
    // Adjust based on block position
    switch (block) {
        case 'start':
            top = window.scrollY + rect.top;
            break;
        case 'center':
            top = window.scrollY + rect.top - (windowHeight / 2) + (rect.height / 2);
            break;
        case 'end':
            top = window.scrollY + rect.bottom - windowHeight;
            break;
        case 'nearest':
            // Only scroll if not in view
            if (rect.top < 0) {
                top = window.scrollY + rect.top;
            } else if (rect.bottom > windowHeight) {
                top = window.scrollY + rect.bottom - windowHeight;
            } else {
                top = window.scrollY;
            }
            break;
    }
    
    return { top, left, behavior: 'smooth' };
}

/**
 * Get highlight class for type
 * @param {string} type - Highlight type
 * @param {boolean} withPrefix - Include 'highlight-' prefix
 * @returns {string} CSS class name
 */
export function getHighlightClass(type, withPrefix = true) {
    const typeMap = {
        correct: 'correct',
        incorrect: 'incorrect',
        missing: 'missing',
        extra: 'extra',
        active: 'active',
        current: 'current'
    };
    
    const base = typeMap[type] || type;
    return withPrefix ? `highlight-${base}` : base;
}

/**
 * Get ARIA label for highlight
 * @param {string} type - Highlight type
 * @param {string} word - The word being highlighted
 * @param {string} language - 'en' or 'ar'
 * @returns {string} ARIA label
 */
export function getHighlightLabel(type, word, language = 'en') {
    const typeLabel = HIGHLIGHT_LABELS[type]?.[language] || type;
    
    if (type === 'correct' || type === 'incorrect') {
        return `${word} (${typeLabel})`;
    }
    
    return typeLabel;
}

/**
 * Check if text contains Arabic
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function hasArabic(text) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Check if text contains honorific
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function hasHonorific(text) {
    return /\{[^}]+\}/.test(text);
}

/**
 * Extract honorific from text
 * @param {string} text - Text containing honorific
 * @returns {Object} Honorific and remaining text
 */
export function extractHonorific(text) {
    const honorifics = [];
    let remaining = text;
    let match;
    
    // Extract all honorifics in format {text}
    const regex = /\{[^}]+\}/g;
    while ((match = regex.exec(text)) !== null) {
        honorifics.push(match[0]);
        remaining = remaining.replace(match[0], '').trim();
    }
    
    return { honorifics, remaining };
}

/**
 * Create highlight styles dynamically
 * @returns {string} CSS styles
 */
export function createHighlightStyles() {
    return `
        .highlight-correct { background-color: rgba(40, 167, 69, 0.2); }
        .highlight-incorrect { background-color: rgba(220, 53, 69, 0.2); text-decoration: line-through; }
        .highlight-missing { background-color: rgba(253, 126, 20, 0.2); text-decoration: underline wavy; }
        .highlight-extra { background-color: rgba(108, 117, 125, 0.2); font-style: italic; }
        .highlight-active { background-color: rgba(255, 193, 7, 0.3); font-weight: bold; }
        .highlight-current { border-left: 3px solid #007bff; padding-left: 5px; }
        
        /* RTL Support */
        [dir="rtl"] .highlight-current {
            border-left: none;
            border-right: 3px solid #007bff;
            padding-left: 0;
            padding-right: 5px;
        }
    `;
}

export default {
    normalizeForComparison,
    splitPreservingWhitespace,
    getTextNodes,
    getWordPositions,
    isInViewport,
    getScrollPosition,
    getHighlightClass,
    getHighlightLabel,
    hasArabic,
    hasHonorific,
    extractHonorific,
    createHighlightStyles,
    HIGHLIGHT_CLASSES,
    HIGHLIGHT_COLORS,
    HIGHLIGHT_LABELS
};