// static/reading/text-to-speech/components/voice-selector.js
// PURPOSE: Voice selection and management with language auto-detection

import { isMobile, hasArabic, hasEnglish } from '../utils/tts-utils.js';

let voices = [];
let voiceSelectElement = null;
let onVoicesChangedCallback = null;
let voicesLoaded = false;
let languagePreference = 'en'; // Default to English

// Storage key for voice preferences
const STORAGE_KEY = 'tts-voice-preference';

/**
 * Initialize voice selector
 * @param {HTMLElement} selectElement - Voice select dropdown
 * @param {Object} options - Configuration options
 * @param {Function} options.onChanged - Callback when voice changes
 * @param {string} options.defaultLanguage - Default language ('en' or 'ar')
 * @param {boolean} options.savePreference - Save to localStorage
 */
export function initVoiceSelector(selectElement, options = {}) {
    const {
        onChanged = null,
        defaultLanguage = 'en',
        savePreference = true
    } = options;

    voiceSelectElement = selectElement;
    onVoicesChangedCallback = onChanged;
    languagePreference = defaultLanguage;

    if (!voiceSelectElement) {
        console.warn('Voice selector: No select element provided');
        return;
    }

    // Check speech synthesis support
    if (!window.speechSynthesis) {
        handleNoSupport();
        return;
    }

    // Set RTL if needed
    if (defaultLanguage === 'ar') {
        voiceSelectElement.setAttribute('dir', 'rtl');
    }

    // Load saved preference
    if (savePreference) {
        loadSavedPreference();
    }

    // Load voices immediately (might be empty)
    loadVoices();

    // Listen for voices changed event (async loading)
    window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
    };
}

/**
 * Handle no speech synthesis support
 */
function handleNoSupport() {
    if (!voiceSelectElement) return;
    
    voiceSelectElement.disabled = true;
    voiceSelectElement.innerHTML = '<option>Speech not supported</option>';
    voiceSelectElement.classList.add('voice-select-error');
}

/**
 * Load available voices
 */
export function loadVoices() {
    if (!window.speechSynthesis) return;
    
    const newVoices = window.speechSynthesis.getVoices();
    
    // Only update if voices changed
    if (JSON.stringify(newVoices) === JSON.stringify(voices)) return;
    
    voices = newVoices;
    
    // Sort voices: English first, then Arabic, then others
    sortVoices();
    
    populateVoiceSelect();
    
    if (voices.length === 0) {
        // Retry if no voices (some browsers need time)
        setTimeout(loadVoices, 200);
    } else if (!voicesLoaded) {
        voicesLoaded = true;
        // Try to restore saved preference
        restoreSavedVoice();
    }
    
    if (onVoicesChangedCallback) {
        onVoicesChangedCallback(voices);
    }
}

/**
 * Sort voices by language preference
 */
function sortVoices() {
    voices.sort((a, b) => {
        const aLang = a.lang.split('-')[0];
        const bLang = b.lang.split('-')[0];
        
        // English first
        if (aLang === 'en' && bLang !== 'en') return -1;
        if (aLang !== 'en' && bLang === 'en') return 1;
        
        // Arabic second
        if (aLang === 'ar' && bLang !== 'ar' && bLang !== 'en') return -1;
        if (aLang !== 'ar' && bLang === 'ar') return 1;
        
        // Then by language code
        if (aLang < bLang) return -1;
        if (aLang > bLang) return 1;
        
        // Finally by name
        return a.name.localeCompare(b.name);
    });
}

/**
 * Populate voice select dropdown
 */
function populateVoiceSelect() {
    if (!voiceSelectElement) return;
    
    const previousValue = voiceSelectElement.value;
    voiceSelectElement.innerHTML = '';
    
    // Enable dropdown if disabled
    voiceSelectElement.disabled = false;
    voiceSelectElement.classList.remove('voice-select-error');
    
    // Add default option
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '📢 Default Voice (Auto)';
    voiceSelectElement.appendChild(defaultOpt);
    
    // Group voices by language
    const voicesByLang = {};
    voices.forEach((voice, index) => {
        const lang = voice.lang.split('-')[0];
        if (!voicesByLang[lang]) voicesByLang[lang] = [];
        voicesByLang[lang].push({ voice, index });
    });
    
    // Add Arabic voices first (since they are most important for this app)
    if (voicesByLang['ar']) {
        addVoiceGroup('🇸🇦 Arabic Voices', voicesByLang['ar']);
    }
    
    // Add English voices
    if (voicesByLang['en']) {
        addVoiceGroup('🇬🇧 English Voices', voicesByLang['en']);
    }
    
    // Add other languages in alphabetical order
    Object.keys(voicesByLang)
        .filter(lang => lang !== 'en' && lang !== 'ar')
        .sort()
        .forEach(lang => {
            addVoiceGroup(`🌐 ${lang.toUpperCase()} Voices`, voicesByLang[lang]);
        });
    
    // Restore previous selection if still valid
    if (previousValue && voiceSelectElement.querySelector(`option[value="${previousValue}"]`)) {
        voiceSelectElement.value = previousValue;
    }
    
    // Add change listener if not already added
    if (!voiceSelectElement._hasChangeListener) {
        voiceSelectElement.addEventListener('change', handleVoiceChange);
        voiceSelectElement._hasChangeListener = true;
    }
}

/**
 * Handle voice change event
 */
function handleVoiceChange(event) {
    const selectedValue = event.target.value;
    
    // Save preference if it's a real voice (not default)
    if (selectedValue && selectedValue !== '') {
        saveVoicePreference(selectedValue);
    }
    
    // Dispatch custom event
    document.dispatchEvent(new CustomEvent('tts-voice-changed', {
        detail: { 
            voiceIndex: selectedValue,
            voice: getSelectedVoice(),
            timestamp: Date.now()
        }
    }));
}

/**
 * Add a group of voices to select
 * @param {string} label - Group label
 * @param {Array} voiceList - List of voices
 */
function addVoiceGroup(label, voiceList) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = label;
    
    voiceList.forEach(({ voice, index }) => {
        const opt = document.createElement('option');
        opt.value = index;
        
        // Mobile-friendly display
        if (isMobile()) {
            opt.textContent = voice.name.split(' ')[0];
        } else {
            // Show quality indicators for premium voices
            const isPremium = voice.name.includes('Premium') || voice.name.includes('Neural');
            const quality = isPremium ? '✨ ' : '';
            opt.textContent = `${quality}${voice.name} (${voice.lang})`;
        }
        
        // Add data attributes for filtering
        opt.dataset.lang = voice.lang;
        opt.dataset.name = voice.name;
        
        optgroup.appendChild(opt);
    });
    
    voiceSelectElement.appendChild(optgroup);
}

/**
 * Get selected voice
 * @returns {SpeechSynthesisVoice|null} Selected voice
 */
export function getSelectedVoice() {
    if (!voiceSelectElement || !voiceSelectElement.value) return null;
    
    const index = parseInt(voiceSelectElement.value, 10);
    return voices[index] || null;
}

/**
 * Set voice by index or language
 * @param {number|string} voice - Voice index or 'en', 'ar' for auto-select
 */
export function setVoice(voice) {
    if (!voiceSelectElement) return;
    
    if (typeof voice === 'number') {
        // Set by index
        if (voice >= 0 && voice < voices.length) {
            voiceSelectElement.value = voice;
            saveVoicePreference(voice);
        }
    } else if (typeof voice === 'string') {
        // Auto-select by language
        const lang = voice.toLowerCase();
        const matchingVoice = voices.find(v => v.lang.startsWith(lang));
        if (matchingVoice) {
            const index = voices.indexOf(matchingVoice);
            voiceSelectElement.value = index;
            saveVoicePreference(index);
        }
    }
}

/**
 * Get all available voices
 * @returns {Array} List of voices
 */
export function getVoices() {
    return voices.map((voice, index) => ({
        index,
        name: voice.name,
        lang: voice.lang,
        default: voice.default,
        localService: voice.localService,
        isPremium: voice.name.includes('Premium') || voice.name.includes('Neural')
    }));
}

/**
 * Find Arabic voice
 * @returns {SpeechSynthesisVoice|null} First Arabic voice found
 */
export function findArabicVoice() {
    return voices.find(v => v.lang.startsWith('ar')) || null;
}

/**
 * Find English voice
 * @returns {SpeechSynthesisVoice|null} First English voice found
 */
export function findEnglishVoice() {
    return voices.find(v => v.lang.startsWith('en')) || null;
}

/**
 * Find the best voice for given text
 * @param {string} text - Text to be spoken
 * @returns {SpeechSynthesisVoice|null} Best matching voice
 */
export function findBestVoiceForText(text) {
    if (!text || !voices.length) return null;
    
    const hasArabicChars = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
    
    if (hasArabicChars) {
        // First try to find a dedicated Arabic voice
        const arabicVoice = findArabicVoice();
        if (arabicVoice) return arabicVoice;
        
        // Fallback to any voice that supports Arabic (by name)
        const arabicSupportingVoice = voices.find(v => 
            v.lang.startsWith('ar') || 
            v.name.toLowerCase().includes('arabic')
        );
        if (arabicSupportingVoice) return arabicSupportingVoice;
    }
    
    // Check if user selected a specific voice
    const selectedVoice = getSelectedVoice();
    if (selectedVoice) return selectedVoice;
    
    // Default to English voice
    return findEnglishVoice();
}

/**
 * Find best voice for text (legacy alias)
 */
export function findVoiceForText(text) {
    return findBestVoiceForText(text);
}

/**
 * Save voice preference to localStorage
 */
function saveVoicePreference(voiceIndex) {
    try {
        localStorage.setItem(STORAGE_KEY, voiceIndex.toString());
    } catch (e) {
        // Ignore storage errors
    }
}

/**
 * Load saved voice preference
 */
function loadSavedPreference() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null) {
            languagePreference = saved;
        }
    } catch (e) {
        // Ignore storage errors
    }
}

/**
 * Restore saved voice after voices load
 */
function restoreSavedVoice() {
    if (!voiceSelectElement || !voicesLoaded) return;
    
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null && voiceSelectElement.querySelector(`option[value="${saved}"]`)) {
            voiceSelectElement.value = saved;
        } else if (languagePreference) {
            // Auto-select based on language preference
            setVoice(languagePreference);
        }
    } catch (e) {
        // Ignore errors
    }
}

/**
 * Reset to default voice
 */
export function resetToDefault() {
    if (!voiceSelectElement) return;
    
    voiceSelectElement.value = '';
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if voices are loaded
 * @returns {boolean}
 */
export function areVoicesLoaded() {
    return voicesLoaded && voices.length > 0;
}

export default {
    initVoiceSelector,
    loadVoices,
    getSelectedVoice,
    setVoice,
    getVoices,
    findArabicVoice,
    findEnglishVoice,
    findBestVoiceForText,
    findVoiceForText,
    resetToDefault,
    areVoicesLoaded
};