// static/reading/reading.highlight.js
// PURPOSE: Real-time word highlighting with Arabic/Unicode support
// DEPENDENCIES: reading.analysis.js

import { analyzeReading, calculateWordSimilarity } from '../reading.analysis.js';

let state = {
    initialized: false, wordMap: new Map(), sentenceMap: new Map(),
    expectedWords: [], expectedText: '', currentTranscript: '',
    updateTimeout: null, highlightMode: 'both',
    colorScheme: { 
        correct: 'word-correct', 
        incorrect: 'word-incorrect', 
        pending: 'word-pending', 
        partial: 'word-partial',
        honorific: 'arabic-honorific'
    },
    elementIds: { container: 'lessonText' },
    callbacks: { onWordUpdate: null, onComplete: null, onError: null },
    config: { 
        debounceTime: 50, 
        partialThreshold: 0.7, 
        highlightPartial: true, 
        preserveWhitespace: true, 
        caseSensitive: false,
        preserveArabicHonorifics: true,
        rtlSupport: true
    }
};
let container = null;

export function initHighlighting(options = {}) {
    if (state.initialized) return getPublicAPI();
    mergeOptions(options);
    container = document.getElementById(state.elementIds.container);
    if (!container) return getPublicAPI();
    addStyles(); setupEventListeners();
    state.initialized = true;
    return getPublicAPI();
}

function mergeOptions(options) {
    if (options.elementIds) state.elementIds = { ...state.elementIds, ...options.elementIds };
    if (options.callbacks) state.callbacks = { ...state.callbacks, ...options.callbacks };
    if (options.config) state.config = { ...state.config, ...options.config };
    if (options.colorScheme) state.colorScheme = { ...state.colorScheme, ...options.colorScheme };
    if (options.highlightMode) state.highlightMode = options.highlightMode;
}

function setupEventListeners() {
    document.addEventListener('speech-interim', handleSpeechInterim);
    document.addEventListener('recording-complete', handleRecordingComplete);
    document.addEventListener('highlighting-reset', handleReset);
}

export function prepareHighlighting(text, preserveStructure = true) {
    if (!container || !text) return;
    
    // Detect if text contains Arabic
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
    
    if (hasArabic && state.config.rtlSupport) {
        container.setAttribute('dir', 'auto');
        container.classList.add('contains-arabic');
    }
    
    state.expectedText = text;
    const normalized = normalizeForComparison(text);
    state.expectedWords = tokenize(normalized);
    state.wordMap.clear(); state.sentenceMap.clear();
    
    if (preserveStructure) annotateExistingStructure(text);
    else createWordSpans(text);
    
    document.dispatchEvent(new CustomEvent('highlighting-prepared', {
        detail: { wordCount: state.expectedWords.length, sentenceCount: state.sentenceMap.size, hasArabic }
    }));
}

function annotateExistingStructure(text) {
    const textNodes = getTextNodes(container);
    let wordIndex = 0;
    
    textNodes.forEach(node => {
        const parent = node.parentNode;
        const text = node.textContent;
        if (!text.trim()) return;
        
        const hasArabic = /[\u0600-\u06FF]/.test(text);
        const parts = splitPreservingWhitespace(text);
        const fragment = document.createDocumentFragment();
        
        parts.forEach(part => {
            if (part.trim()) {
                const span = document.createElement('span');
                span.className = `reading-word ${state.colorScheme.pending}`;
                span.setAttribute('data-word-index', wordIndex);
                
                // Check if this part contains an honorific
                const hasHonorific = /\{[^}]+\}/.test(part);
                
                if (hasArabic) {
                    // For Arabic, store the exact text
                    span.setAttribute('data-word', part.trim());
                    
                    if (hasHonorific) {
                        span.classList.add(state.colorScheme.honorific);
                    }
                    
                    // Split honorific into its own span if needed
                    if (hasHonorific && part.length > 3) {
                        const honorificMatch = part.match(/\{[^}]+\}/);
                        if (honorificMatch) {
                            const honorific = honorificMatch[0];
                            const wordPart = part.replace(honorific, '');
                            
                            if (wordPart) {
                                const wordSpan = document.createElement('span');
                                wordSpan.className = `reading-word ${state.colorScheme.pending}`;
                                wordSpan.setAttribute('data-word-index', wordIndex);
                                wordSpan.setAttribute('data-word', wordPart.trim());
                                wordSpan.textContent = wordPart;
                                fragment.appendChild(wordSpan);
                                state.wordMap.set(wordIndex, wordSpan);
                                wordIndex++;
                            }
                            
                            const honorificSpan = document.createElement('span');
                            honorificSpan.className = `reading-word arabic-honorific ${state.colorScheme.pending}`;
                            honorificSpan.setAttribute('data-word-index', wordIndex);
                            honorificSpan.setAttribute('data-word', honorific);
                            honorificSpan.textContent = honorific;
                            fragment.appendChild(honorificSpan);
                            state.wordMap.set(wordIndex, honorificSpan);
                            wordIndex++;
                        } else {
                            span.textContent = part;
                            fragment.appendChild(span);
                            state.wordMap.set(wordIndex, span);
                            wordIndex++;
                        }
                    } else {
                        span.textContent = part;
                        fragment.appendChild(span);
                        state.wordMap.set(wordIndex, span);
                        wordIndex++;
                    }
                } else {
                    // For English, store normalized version
                    const cleanWord = part.replace(/[.,!?;:]/g, '').toLowerCase();
                    span.setAttribute('data-word', cleanWord);
                    span.textContent = part;
                    fragment.appendChild(span);
                    state.wordMap.set(wordIndex, span);
                    wordIndex++;
                }
                
                const sentenceEl = parent.closest('.reading-sentence');
                if (sentenceEl) {
                    const sentenceIndex = sentenceEl.dataset.sentence;
                    if (sentenceIndex !== undefined) {
                        if (!state.sentenceMap.has(sentenceIndex)) {
                            state.sentenceMap.set(sentenceIndex, []);
                        }
                        state.sentenceMap.get(sentenceIndex).push(wordIndex - 1);
                    }
                }
            } else {
                fragment.appendChild(document.createTextNode(part));
            }
        });
        
        parent.replaceChild(fragment, node);
    });
}

function createWordSpans(text) {
    const words = tokenize(text);
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    
    container.innerHTML = words.map((word, index) => {
        const hasHonorific = /\{[^}]+\}/.test(word);
        const honorificClass = hasHonorific ? 'arabic-honorific' : '';
        return `<span class="reading-word ${state.colorScheme.pending} ${honorificClass}" 
                       data-word-index="${index}"
                       data-word="${word.replace(/[{}]/g, '')}">${word}</span>`;
    }).join(' ');
    
    container.querySelectorAll('.reading-word').forEach((el, index) => state.wordMap.set(index, el));
    state.sentenceMap.set(0, Array.from({ length: words.length }, (_, i) => i));
}

function getTextNodes(element) {
    const nodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            if (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
}

function splitPreservingWhitespace(text) {
    const parts = []; let current = ''; let inWord = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isWhitespace = /\s/.test(char);
        if (isWhitespace !== inWord && current) { parts.push(current); current = ''; }
        current += char;
        inWord = !isWhitespace;
    }
    if (current) parts.push(current);
    return parts;
}

function handleSpeechInterim(event) {
    const transcript = event.detail?.transcript;
    if (!transcript) return;
    if (state.updateTimeout) clearTimeout(state.updateTimeout);
    state.updateTimeout = setTimeout(() => updateHighlight(transcript), state.config.debounceTime);
}

function handleRecordingComplete(event) {
    const transcript = event.detail?.transcript;
    if (!transcript) return;
    performHighlightUpdate(transcript, true);
    triggerCallback('onComplete', { transcript });
}

function handleReset() { resetHighlights(); }

export function updateHighlight(spokenText) {
    if (!spokenText || state.expectedWords.length === 0) return;
    state.currentTranscript = spokenText;
    performHighlightUpdate(spokenText, false);
}

function performHighlightUpdate(spokenText, isFinal = false) {
    const normalizedSpoken = normalizeForComparison(spokenText);
    const result = analyzeReading(normalizedSpoken, state.expectedWords.join(' '), { 
        ignorePunctuation: true,
        preserveArabicHonorifics: state.config.preserveArabicHonorifics 
    });
    
    resetHighlights();
    
    result.correct.forEach(item => {
        const index = item.expectedIndex !== undefined ? item.expectedIndex : item.index;
        const element = state.wordMap.get(index);
        if (element) {
            element.classList.remove(state.colorScheme.pending, state.colorScheme.incorrect, state.colorScheme.partial);
            element.classList.add(state.colorScheme.correct);
            element.title = 'Correct';
        }
    });
    
    result.incorrect.forEach(item => {
        const index = item.expectedIndex;
        const element = state.wordMap.get(index);
        if (element) {
            const similarity = calculateWordSimilarity(
                item.heard || '', 
                item.expected || '', 
                { preserveArabicHonorifics: state.config.preserveArabicHonorifics }
            );
            const isPartial = state.config.highlightPartial && similarity >= state.config.partialThreshold;
            
            element.classList.remove(state.colorScheme.pending);
            
            if (isPartial) {
                element.classList.add(state.colorScheme.partial);
                element.title = `Close match: heard "${item.heard}"`;
            } else {
                element.classList.add(state.colorScheme.incorrect);
                element.title = `Incorrect: heard "${item.heard}"`;
            }
        }
    });
    
    result.missing.forEach(item => {
        const index = item.expectedIndex !== undefined ? item.expectedIndex : item.index;
        const element = state.wordMap.get(index);
        if (element && !element.classList.contains(state.colorScheme.correct)) {
            element.classList.remove(state.colorScheme.pending);
            element.classList.add(state.colorScheme.incorrect);
            element.title = 'Missing word';
        }
    });
    
    if (result.extra.length > 0) {
        document.dispatchEvent(new CustomEvent('extra-words-detected', {
            detail: { count: result.extra.length, words: result.extra }
        }));
    }
    
    if (state.highlightMode === 'sentence' || state.highlightMode === 'both') updateSentenceHighlighting(result);
    
    triggerCallback('onWordUpdate', { 
        result, isFinal, 
        correct: result.correct.length, 
        incorrect: result.incorrect.length, 
        missing: result.missing.length, 
        extra: result.extra.length 
    });
    
    document.dispatchEvent(new CustomEvent('highlighting-updated', { 
        detail: { result, isFinal, timestamp: Date.now() } 
    }));
}

function updateSentenceHighlighting(result) {
    state.sentenceMap.forEach((wordIndices, sentenceIndex) => {
        const sentenceElement = container.querySelector(`[data-sentence="${sentenceIndex}"]`);
        if (!sentenceElement) return;
        
        const correctInSentence = wordIndices.filter(index => 
            result.correct.some(c => c.expectedIndex === index)
        ).length;
        
        const totalInSentence = wordIndices.length;
        const accuracy = (correctInSentence / totalInSentence) * 100;
        
        sentenceElement.classList.remove('sentence-correct', 'sentence-partial', 'sentence-incorrect');
        
        if (accuracy === 100) sentenceElement.classList.add('sentence-correct');
        else if (accuracy >= 70) sentenceElement.classList.add('sentence-partial');
        else sentenceElement.classList.add('sentence-incorrect');
        
        sentenceElement.setAttribute('data-accuracy', accuracy.toFixed(1));
    });
}

function resetHighlights() {
    state.wordMap.forEach(element => {
        element.classList.remove(
            state.colorScheme.correct, 
            state.colorScheme.incorrect, 
            state.colorScheme.partial
        );
        element.classList.add(state.colorScheme.pending);
        element.title = '';
    });
    
    container.querySelectorAll('.reading-sentence').forEach(el => {
        el.classList.remove('sentence-correct', 'sentence-partial', 'sentence-incorrect');
    });
}

export function clearHighlights() { resetHighlights(); }

function normalizeForComparison(text) {
    if (!text) return '';
    
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    
    if (hasArabic && state.config.preserveArabicHonorifics) {
        // For Arabic, just normalize spaces
        return text.replace(/\s+/g, ' ').trim();
    } else {
        // For English or Arabic without honorific preservation
        return text.toLowerCase()
            .replace(/[.,!?;:()\[\]{}"]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
}

function tokenize(text) {
    if (!text) return [];
    
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    
    if (hasArabic) {
        return text.split(/\s+/).filter(word => word.length > 0);
    } else {
        return text.split(/\s+/);
    }
}

function triggerCallback(name, data) {
    if (state.callbacks[name] && typeof state.callbacks[name] === 'function') {
        try { state.callbacks[name](data); } catch (error) { console.error(`Callback ${name} failed:`, error); }
    }
}

export function getHighlightStats() {
    let correct = 0, incorrect = 0, partial = 0, pending = 0;
    state.wordMap.forEach(element => {
        if (element.classList.contains(state.colorScheme.correct)) correct++;
        else if (element.classList.contains(state.colorScheme.partial)) partial++;
        else if (element.classList.contains(state.colorScheme.incorrect)) incorrect++;
        else pending++;
    });
    
    return {
        total: state.wordMap.size, correct, incorrect, partial, pending,
        accuracy: state.wordMap.size > 0 ? ((correct + (partial * 0.5)) / state.wordMap.size * 100).toFixed(1) : 0
    };
}

export function destroyHighlighting() {
    document.removeEventListener('speech-interim', handleSpeechInterim);
    document.removeEventListener('recording-complete', handleRecordingComplete);
    document.removeEventListener('highlighting-reset', handleReset);
    if (state.updateTimeout) clearTimeout(state.updateTimeout);
    state.wordMap.clear(); state.sentenceMap.clear();
    state.initialized = false;
}

function addStyles() {
    if (document.getElementById('reading-highlight-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'reading-highlight-styles';
    style.textContent = `
        .reading-word { 
            display: inline-block; 
            transition: all 0.2s ease; 
            padding: 0 2px; 
            border-radius: 3px; 
        }
        
        .reading-word.word-pending { 
            background-color: transparent; 
            color: inherit; 
        }
        
        .reading-word.word-correct { 
            background-color: rgba(40, 167, 69, 0.2); 
            color: #155724; 
            border-bottom: 2px solid #28a745; 
        }
        
        .reading-word.word-partial { 
            background-color: rgba(255, 193, 7, 0.2); 
            color: #856404; 
            border-bottom: 2px solid #ffc107; 
        }
        
        .reading-word.word-incorrect { 
            background-color: rgba(220, 53, 69, 0.2); 
            color: #721c24; 
            border-bottom: 2px solid #dc3545; 
            text-decoration: line-through; 
            text-decoration-color: #dc3545; 
        }
        
        /* Arabic honorific styling */
        .reading-word.arabic-honorific {
            font-family: 'Traditional Arabic', 'Scheherazade', 'Amiri', serif;
            color: #b8860b;
            font-size: 1.2em;
            font-weight: bold;
            background-color: rgba(184, 134, 11, 0.1);
            border-bottom: 2px solid #b8860b;
            padding: 0 4px;
            margin: 0 1px;
            white-space: nowrap;
        }
        
        /* RTL Support */
        [dir="rtl"] .reading-sentence {
            text-align: right;
        }
        
        [dir="rtl"] .reading-sentence.active-sentence {
            border-left: none;
            border-right: 4px solid #ffc107;
            padding-left: 0;
            padding-right: 1rem;
        }
        
        /* Container with Arabic */
        .contains-arabic {
            font-family: 'Traditional Arabic', 'Scheherazade', 'Amiri', 'Times New Roman', serif;
            line-height: 2;
        }
        
        .reading-sentence { 
            transition: all 0.3s ease; 
            padding: 0.5rem; 
            margin-bottom: 1rem; 
            border-radius: 4px; 
        }
        
        .reading-sentence.sentence-correct { 
            background-color: rgba(40, 167, 69, 0.05); 
            border-left: 4px solid #28a745; 
        }
        
        .reading-sentence.sentence-partial { 
            background-color: rgba(255, 193, 7, 0.05); 
            border-left: 4px solid #ffc107; 
        }
        
        .reading-sentence.sentence-incorrect { 
            background-color: rgba(220, 53, 69, 0.05); 
            border-left: 4px solid #dc3545; 
        }
        
        @media (max-width: 768px) {
            .reading-word { padding: 2px 1px; }
            .reading-sentence { padding: 0.75rem 0.5rem; font-size: 1.1rem; line-height: 1.8; }
        }
        
        @media (prefers-contrast: high) {
            .reading-word.word-correct { background-color: transparent; border-bottom: 3px solid #00ff00; }
            .reading-word.word-incorrect { background-color: transparent; border-bottom: 3px solid #ff0000; }
            .reading-word.word-partial { background-color: transparent; border-bottom: 3px solid #ffff00; }
            .reading-word.arabic-honorific { border-bottom: 3px solid #b8860b; }
        }
        
        @media (prefers-reduced-motion: reduce) { 
            .reading-word, .reading-sentence { transition: none; } 
        }
    `;
    
    document.head.appendChild(style);
}

function getPublicAPI() {
    return { 
        init: initHighlighting, 
        prepare: prepareHighlighting, 
        update: updateHighlight, 
        clear: clearHighlights, 
        getStats: getHighlightStats, 
        destroy: destroyHighlighting 
    };
}

export default getPublicAPI();