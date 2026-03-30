// static/reading/core/app-state.js
// PURPOSE: Central reactive state management integrated with EventBus

import EventBus from './event-bus.js';

/* =========================================================
   EVENT CONSTANTS
========================================================= */

export const STATE_CHANGED = 'state:changed';
export const MODULE_STATUS_CHANGED = 'module:status-changed';
export const LESSON_CHANGED = 'lesson:changed';
export const LANGUAGE_CHANGED = 'language:changed';
export const STATE_RESET = 'state:reset';

/* =========================================================
   PRIVATE STATE
========================================================= */

let _state = {

    initialized: false,

    appContainer: null,

    currentLesson: null,

    currentLanguage: 'en',

    isLoading: false,

    error: null,

    isMobile: false,

    moduleStatus: {
        text: false,
        highlight: false,
        recognition: false,
        feedback: false,
        ui: false
    },

    userPreferences: {
        autoScroll: true,
        preferredVoice: null,
        preferredLanguage: 'en',
        darkMode: false,
        fontSize: 'medium'
    },

    elementIds: {
        appContainer: 'reading-app',
        title: 'lessonTitle',
        text: 'lessonText',             // SYNCED: Matches HTML id="lessonText"
        voiceSelect: 'voiceSelect',
        readBtn: 'readBtn',
        pauseBtn: 'pauseBtn',
        resumeBtn: 'resumeBtn',
        stopBtn: 'stopBtn',
        startListeningBtn: 'startListeningBtn',
        stopListeningBtn: 'stopListeningBtn',
        recordingStatus: 'recording-status',
        scoreDisplay: 'readingScore',
        feedbackText: 'readingDetails', // SYNCED: Matches HTML id="readingDetails"
        problemWords: 'problemWords',
        loadingIndicator: 'readingLoading',
        errorContainer: 'readingError',
        progressBar: 'readingProgressBar',
        transcript: 'liveTranscript'
    },

    apiEndpoints: {
        lessons: [
            '/reading/api/lessons/{id}/',
            '/api/reading/lessons/{id}/',
            '/reading/lessons/{id}/',
            '/api/lessons/{id}/'
        ],
        feedback: '/reading/api/feedback/'
    },

    config: {
        cacheLessons: true,
        cacheTTL: 300000,
        autoInitModules: true,
        showLoadingIndicator: true,
        retryOnError: true,
        maxRetries: 2,
        mobileOptimizations: true,
        debounceTime: 100,
        minSpeechLength: 10
    }

};

/* =========================================================
   MODULE DEPENDENCIES
========================================================= */

const moduleDependencies = {
    text: [],
    recognition: ['text'],
    highlight: ['text'],
    feedback: ['recognition'],
    ui: ['text', 'recognition', 'feedback', 'highlight']
};

/* =========================================================
   INTERNAL STRUCTURES
========================================================= */

const lessonCache = new Map();
const listeners = new Map();
let nextToken = 1;

/* =========================================================
   SUBSCRIPTION SYSTEM
========================================================= */

export function subscribe(callback, paths = null) {
    const token = nextToken++;
    listeners.set(token, { callback, paths });
    return token;
}

export function unsubscribe(token) {
    listeners.delete(token);
}

function notify(path, newValue, oldValue) {
    listeners.forEach(({ callback, paths }) => {
        if (!paths || paths.some(p => path.startsWith(p))) {
            callback(path, newValue, oldValue, _state);
        }
    });
    EventBus.emit(STATE_CHANGED, { path, newValue, oldValue });
}

/* =========================================================
   STATE ACCESS
========================================================= */

export function getState() {
    return structuredClone(_state);
}

export function get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], _state);
}

/* =========================================================
   STATE MUTATION
========================================================= */

export function set(path, value) {
    const parts = path.split('.');
    const key = parts.pop();
    const target = parts.reduce((obj, part) => {
        if (!(part in obj)) obj[part] = {};
        return obj[part];
    }, _state);

    const oldValue = target[key];
    if (oldValue === value) return false;

    target[key] = value;
    notify(path, value, oldValue);

    /* ---- SPECIAL EVENTS ---- */

    if (path === 'currentLesson') {
        EventBus.emit(LESSON_CHANGED, { lesson: value, oldLesson: oldValue });
    }

    if (path === 'currentLanguage') {
        document.documentElement.lang = value;
        document.documentElement.dir = value === 'ar' ? 'rtl' : 'ltr';
        EventBus.emit(LANGUAGE_CHANGED, { language: value, oldLanguage: oldValue });
    }

    if (path.startsWith('moduleStatus.')) {
        const module = path.split('.')[1];
        EventBus.emit(MODULE_STATUS_CHANGED, {
            module,
            status: value,
            dependencies: moduleDependencies[module]
        });
    }

    return true;
}

export function areDependenciesReady(module) {
    const deps = moduleDependencies[module] || [];
    return deps.every(dep => _state.moduleStatus[dep]);
}

export function getCurrentLesson() {
    return _state.currentLesson;
}

export function setCurrentLesson(lesson) {
    set('currentLesson', lesson);
}

export function updateModuleStatus(module, status) {
    if (module in _state.moduleStatus) {
        set(`moduleStatus.${module}`, status);
    }
}

export function isLoading() {
    return _state.isLoading;
}

export function setLoading(loading) {
    set('isLoading', loading);
}

export function setError(error) {
    set('error', error);
}

export function getElementIds() {
    return { ..._state.elementIds };
}

export function getApiEndpoints() {
    return { ..._state.apiEndpoints };
}

export function getConfig() {
    return { ..._state.config };
}

export function isMobile() {
    return _state.isMobile;
}

export function setUserPreference(key, value) {
    set(`userPreferences.${key}`, value);
    try {
        const prefs = JSON.parse(localStorage.getItem('reading_prefs') || '{}');
        prefs[key] = value;
        localStorage.setItem('reading_prefs', JSON.stringify(prefs));
    } catch (e) {
        console.warn('Preference save failed', e);
    }
}

export function loadUserPreferences() {
    try {
        const prefs = JSON.parse(localStorage.getItem('reading_prefs') || '{}');
        Object.entries(prefs).forEach(([k, v]) => {
            if (k in _state.userPreferences) {
                set(`userPreferences.${k}`, v);
            }
        });
    } catch (e) {}
}

export function cacheLesson(id, lesson) {
    if (!_state.config.cacheLessons) return;
    lessonCache.set(String(id), {
        data: lesson,
        timestamp: Date.now()
    });
}

export function getCachedLesson(id) {
    const cached = lessonCache.get(String(id));
    if (!cached) return null;
    if (Date.now() - cached.timestamp > _state.config.cacheTTL) {
        lessonCache.delete(String(id));
        return null;
    }
    return cached.data;
}

export function clearLessonCache() {
    lessonCache.clear();
}

export function resetState() {
    _state.currentLesson = null;
    _state.isLoading = false;
    _state.error = null;
    Object.keys(_state.moduleStatus).forEach(m => {
        _state.moduleStatus[m] = false;
    });
    EventBus.emit(STATE_RESET);
}

export function initAppState(options = {}) {
    if (_state.initialized) return;

    if (options.elementIds) Object.assign(_state.elementIds, options.elementIds);
    if (options.config) Object.assign(_state.config, options.config);
    if (options.apiEndpoints) Object.assign(_state.apiEndpoints, options.apiEndpoints);
    if (options.language) set('currentLanguage', options.language);

    _state.isMobile = window.matchMedia("(pointer:coarse)").matches;

    loadUserPreferences();

    _state.initialized = true;
    console.log('📊 App State Initialized');
}

/* =========================================================
   PUBLIC API
========================================================= */

const AppState = {
    subscribe,
    unsubscribe,
    getState,
    get,
    set,
    getCurrentLesson,
    setCurrentLesson,
    updateModuleStatus,
    areDependenciesReady,
    isLoading,
    setLoading,
    setError,
    getElementIds,
    getApiEndpoints,
    getConfig,
    isMobile,
    setUserPreference,
    cacheLesson,
    getCachedLesson,
    clearLessonCache,
    resetState,
    initAppState,
    STATE_CHANGED,
    MODULE_STATUS_CHANGED,
    LESSON_CHANGED,
    LANGUAGE_CHANGED,
    STATE_RESET
};

export default Object.freeze(AppState);