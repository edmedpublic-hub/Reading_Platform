// static/reading/highlighting/index.js
// PURPOSE: Public API for highlighting module - coordinates word and sentence highlighters

import { 
    initWordHighlighter, 
    prepareWords, 
    updateWordHighlighting, 
    resetHighlights, 
    getHighlightStats, 
    clearHighlights,
    colorScheme 
} from './components/word-highlighter.js';

import { 
    initSentenceHighlighter, 
    buildSentenceMap, 
    updateSentenceHighlighting, 
    resetSentenceHighlights,
    highlightSentence,
    setAutoScroll as setSentenceAutoScroll,
    getCurrentSentence
} from './components/sentence-highlighter.js';

import { 
    getTextNodes, 
    splitPreservingWhitespace, 
    hasArabic, 
    hasHonorific, 
    extractHonorific
} from './utils/highlight-utils.js';

// Module state
let initialized = false;
let container = null;
let wordMap = new Map();
let updateTimeout = null;
let expectedText = '';
let ttsAPI = null;

let config = {
    debounceTime: 50,
    highlightMode: 'both', 
    preserveArabicHonorifics: true,
    autoScroll: true,
    language: 'en'
};

let callbacks = {};

export function init(options = {}) {
    if (initialized) return getPublicAPI();
    
    const containerId = options.container || (options.elementIds && options.elementIds.container) || 'lessonText';
    container = document.getElementById(containerId);

    if (!container) {
        console.warn(`Highlighting container #${containerId} not found`);
        return getPublicAPI();
    }
    
    if (options.ttsAPI) {
        ttsAPI = options.ttsAPI;
    }
    
    config = { ...config, ...(options.config || {}), language: options.language || 'en' };
    callbacks = { ...callbacks, ...(options.callbacks || {}) };
    
    initWordHighlighter({ 
        config,
        callbacks: { onWordClick: handleWordClick }
    });
    
    initSentenceHighlighter(container, {
        autoScroll: config.autoScroll,
        onSentenceChange: handleSentenceChange
    });
    
    setupEventListeners();
    addStyles();
    
    initialized = true;
    console.log('✨ Highlighting module ready');
    
    return getPublicAPI();
}

/**
 * ALIAS: setText
 * Maps to prepare() so main.js can call it consistently
 */
export function setText(text) {
    return prepare(text, false);
}

export function prepare(text, preserveStructure = true) {
    if (!container || !text) return;
    
    expectedText = text;
    
    if (preserveStructure) {
        annotateExistingStructure(text);
    } else {
        createWordSpans(text);
    }
    
    // Build the map that links word elements to sentence blocks
    buildSentenceMap(wordMap);
    
    if (hasArabic(text)) {
        container.setAttribute('dir', 'auto');
    }
    
    document.dispatchEvent(new CustomEvent('highlighting-prepared', {
        detail: { 
            wordCount: wordMap.size,
            sentenceCount: container.querySelectorAll('.reading-sentence').length,
            hasArabic: hasArabic(text)
        }
    }));
    
    return true;
}

/* --- Internal Logic --- */

function setupEventListeners() {
    document.addEventListener('speech-interim', handleSpeechInterim);
    document.addEventListener('recording-complete', handleRecordingComplete);
    document.addEventListener('tts-progress', handleTTSProgress);
    document.addEventListener('display-feedback', handleFeedbackDisplay);
}

function handleTTSProgress(event) {
    if (callbacks.onTTSProgress) callbacks.onTTSProgress(event.detail);
}

function handleFeedbackDisplay(event) {
    const { analysis } = event.detail;
    if (analysis && (config.highlightMode === 'word' || config.highlightMode === 'both')) {
        updateWordHighlightingFromAnalysis(analysis);
    }
}

function handleWordClick(wordData) {
    if (callbacks.onWordClick) callbacks.onWordClick(wordData);
}

function handleSentenceChange(sentenceData) {
    if (callbacks.onSentenceChange) callbacks.onSentenceChange(sentenceData);
}

function handleSpeechInterim(event) {
    const transcript = event.detail?.transcript;
    if (!transcript) return;
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => update(transcript, false), config.debounceTime);
}

function handleRecordingComplete(event) {
    const transcript = event.detail?.transcript;
    if (transcript) update(transcript, true);
}

function annotateExistingStructure(text) {
    const textNodes = getTextNodes(container);
    let wordIndex = 0;
    wordMap.clear();

    textNodes.forEach(node => {
        const parent = node.parentNode;
        const val = node.textContent;
        if (!val.trim()) return;
        
        const parts = splitPreservingWhitespace(val);
        const fragment = document.createDocumentFragment();
        
        parts.forEach(part => {
            if (part.trim()) {
                const span = createWordSpan(part, wordIndex);
                fragment.appendChild(span);
                wordMap.set(wordIndex, span);
                wordIndex++;
            } else {
                fragment.appendChild(document.createTextNode(part));
            }
        });
        parent.replaceChild(fragment, node);
    });
}

function createWordSpan(word, index) {
    const span = document.createElement('span');
    span.className = `reading-word ${colorScheme.pending}`;
    span.setAttribute('data-word-index', index);
    span.setAttribute('data-word', word.replace(/[.,!?;:(){}[\]]/g, '').toLowerCase());
    if (hasArabic(word)) span.setAttribute('lang', 'ar');
    
    if (hasHonorific(word)) {
        span.classList.add(colorScheme.honorific);
        span.setAttribute('data-honorific', 'true');
    }
    
    span.textContent = word;
    return span;
}

/**
 * FIXED: Groups words into sentence blocks so TTS and Highlighter can map them
 */
function createWordSpans(text) {
    // Splits text into sentences based on punctuation
    const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [text];
    let globalWordIndex = 0;
    wordMap.clear();

    container.innerHTML = sentences.map((sentenceText, sIndex) => {
        const words = sentenceText.trim().split(/\s+/);
        
        const wordSpans = words.map((word) => {
            const arabic = hasArabic(word) ? 'lang="ar"' : '';
            const cleanWord = word.replace(/[.,!?;:(){}[\]]/g, '').toLowerCase();
            const index = globalWordIndex++;
            
            return `<span class="reading-word ${colorScheme.pending}" 
                          data-word-index="${index}"
                          data-word="${cleanWord}"
                          ${arabic}>${word}</span>`;
        }).join(' ');

        // Wrap the word spans in a reading-sentence container
        return `<div class="reading-sentence" data-sentence="${sIndex}">${wordSpans}</div>`;
    }).join('\n');

    // Sync the internal wordMap with the newly created DOM elements
    container.querySelectorAll('.reading-word').forEach((el) => {
        const idx = parseInt(el.dataset.wordIndex);
        wordMap.set(idx, el);
    });
    
    console.log(`📖 Created ${sentences.length} sentence blocks.`);
}

export function update(spokenText, isFinal = false) {
    if (!spokenText || wordMap.size === 0) return;
    const wordElements = Array.from(wordMap.values());
    prepareWords(expectedText, wordElements, config.preserveArabicHonorifics);
    const result = updateWordHighlighting(spokenText, isFinal);
    
    if (result && (config.highlightMode === 'sentence' || config.highlightMode === 'both')) {
        updateSentenceHighlighting(result);
    }
}

export function updateWordHighlightingFromAnalysis(analysis) {
    if (!analysis || wordMap.size === 0) return;
    import('./components/word-highlighter.js').then(module => {
        module.updateWordHighlightingFromAnalysis(analysis);
        if (config.highlightMode === 'sentence' || config.highlightMode === 'both') {
            updateSentenceHighlighting(analysis);
        }
    });
}

export function clear() {
    clearHighlights();
    resetSentenceHighlights();
    wordMap.clear();
}

export function getStats() { return getHighlightStats(); }

export function setAutoScroll(enabled) {
    config.autoScroll = enabled;
    setSentenceAutoScroll(enabled);
}

export function jumpToSentence(index) { highlightSentence(index, true); }

export function getCurrentSentenceIndex() { return getCurrentSentence(); }

function addStyles() {
    if (document.getElementById('highlighting-styles')) return;
    const style = document.createElement('style');
    style.id = 'highlighting-styles';
    style.textContent = `
        .reading-sentence { margin-bottom: 12px; padding: 4px; border-radius: 4px; transition: all 0.3s; }
        .reading-word { display: inline-block; transition: all 0.2s ease; padding: 0 2px; border-radius: 3px; cursor: pointer; }
        .reading-word.${colorScheme.correct} { background-color: rgba(40, 167, 69, 0.2); color: #155724; border-bottom: 2px solid #28a745; }
        .reading-word.${colorScheme.incorrect} { background-color: rgba(220, 53, 69, 0.2); color: #721c24; border-bottom: 2px solid #dc3545; }
        .sentence-active { background-color: rgba(0, 123, 255, 0.1); border-left: 4px solid #007bff; padding-left: 8px; }
    `;
    document.head.appendChild(style);
}

function getPublicAPI() {
    return {
        init,
        prepare,
        setText,
        update,
        clear,
        getStats,
        setAutoScroll,
        jumpToSentence,
        getCurrentSentenceIndex
    };
}

export default getPublicAPI();