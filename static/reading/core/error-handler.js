// static/reading/core/error-handler.js
// PURPOSE: Central error handling with categorization, logging, and recovery

import EventBus from './event-bus.js';

/* ======================================================
   ERROR LEVELS
====================================================== */

export const ErrorLevel = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    FATAL: 'fatal'
};

/* ======================================================
   ERROR CATEGORIES
====================================================== */

export const ErrorCategory = {
    NETWORK: 'network',
    PERMISSION: 'permission',
    VALIDATION: 'validation',
    TIMEOUT: 'timeout',
    API: 'api',
    RECOGNITION: 'recognition',
    TTS: 'tts',
    UI: 'ui',
    UNKNOWN: 'unknown'
};

/* ======================================================
   INTERNAL STORAGE
====================================================== */

let errorHistory = [];

const MAX_HISTORY = 50;

const suppressedErrors = new Map();

const SUPPRESS_DURATION = 5000;

/* ======================================================
   ERROR HANDLER
====================================================== */

export const ErrorHandler = {

    /* --------------------------------------------------
       MAIN ERROR HANDLER
    -------------------------------------------------- */

    handle(error, options = {}) {

        const {
            category = ErrorCategory.UNKNOWN,
            level = ErrorLevel.ERROR,
            context = 'app',
            retryCallback = null,
            metadata = {},
            suppress = false
        } = options;

        const message =
            typeof error === 'string'
                ? error
                : error?.message || 'Unknown error';

        const errorObj = typeof error === 'object' ? error : null;

        const report = {
            id: this._generateErrorId(),
            message,
            category,
            level,
            context,
            timestamp: Date.now(),

            error: errorObj
                ? {
                      name: errorObj.name,
                      message: errorObj.message,
                      stack: errorObj.stack,
                      code: errorObj.code
                  }
                : null,

            metadata,
            retryCallback,
            url: window.location.href
        };

        if (suppress && this._isSuppressed(report)) {

            console.log(`🔇 Suppressed error: ${message}`);

            return report;

        }

        this._logError(report);

        this._addToHistory(report);

        this._showInUI(report);

        this._dispatchEvent(report);

        if (level === ErrorLevel.FATAL) {

            this._handleFatal(report);

        }

        if (suppress) {

            this._trackSuppression(report);

        }

        return report;
    },

    /* --------------------------------------------------
       API ERRORS
    -------------------------------------------------- */

    handleApiError(error, context = 'api', retryCallback = null) {

        const status = error?.status || error?.cause?.status;

        let category = ErrorCategory.API;

        let level = ErrorLevel.ERROR;

        let message = error.message || 'API request failed';

        if (status === 429) {

            category = ErrorCategory.NETWORK;

            level = ErrorLevel.WARNING;

            message = 'Too many requests. Please wait.';

        }

        else if (status >= 500) {

            message = 'Server error. Please try again later.';

        }

        else if (status === 401 || status === 403) {

            category = ErrorCategory.PERMISSION;

            level = ErrorLevel.WARNING;

            message = 'Authentication error. Please refresh.';

        }

        else if (status === 400) {

            category = ErrorCategory.VALIDATION;

            level = ErrorLevel.WARNING;

            message = 'Invalid request. Please check input.';

        }

        if (error.message?.toLowerCase().includes('network')) {

            category = ErrorCategory.NETWORK;

            level = ErrorLevel.WARNING;

        }

        return this.handle(message, {

            category,

            level,

            context: `api:${context}`,

            retryCallback,

            metadata: { status },

            suppress: status === 429

        });

    },

    /* --------------------------------------------------
       SPEECH RECOGNITION ERRORS
    -------------------------------------------------- */

    handleRecognitionError(error, context = 'recognition') {

        return this.handle(error, {

            category: ErrorCategory.RECOGNITION,

            level: ErrorLevel.WARNING,

            context: `recognition:${context}`,

            metadata: { errorCode: error?.error }

        });

    },

    /* --------------------------------------------------
       TEXT TO SPEECH ERRORS
    -------------------------------------------------- */

    handleTTSError(error, context = 'tts') {

        return this.handle(error, {

            category: ErrorCategory.TTS,

            level: ErrorLevel.ERROR,

            context: `tts:${context}`

        });

    },

    /* --------------------------------------------------
       VALIDATION
    -------------------------------------------------- */

    handleValidationError(message, context = 'validation') {

        return this.handle(message, {

            category: ErrorCategory.VALIDATION,

            level: ErrorLevel.WARNING,

            context

        });

    },

    /* --------------------------------------------------
       PERMISSION
    -------------------------------------------------- */

    handlePermissionError(error, context = 'permission') {

        return this.handle(error, {

            category: ErrorCategory.PERMISSION,

            level: ErrorLevel.WARNING,

            context,

            suppress: true

        });

    },

    warn(message, context = 'app', metadata = {}) {

        return this.handle(message, {

            category: ErrorCategory.UNKNOWN,

            level: ErrorLevel.WARNING,

            context,

            metadata

        });

    },

    info(message, context = 'app', metadata = {}) {

        return this.handle(message, {

            category: ErrorCategory.UNKNOWN,

            level: ErrorLevel.INFO,

            context,

            metadata

        });

    },

    /* --------------------------------------------------
       LOGGING
    -------------------------------------------------- */

    _logError(report) {

        const { level, message, context } = report;

        const msg = `[${context}] ${message}`;

        if (level === ErrorLevel.INFO) {

            console.info('ℹ️', msg);

        }

        else if (level === ErrorLevel.WARNING) {

            console.warn('⚠️', msg);

        }

        else {

            console.error('❌', msg);

        }

    },

    /* --------------------------------------------------
       UI NOTIFICATION
    -------------------------------------------------- */

    _showInUI(report) {

        const userMessage = this._getUserFriendlyMessage(report);

        EventBus.emit('ui:error', {

            message: userMessage,

            level: report.level,

            category: report.category,

            retryCallback: report.retryCallback,

            errorId: report.id

        });

    },

    _getUserFriendlyMessage(report) {

        const { category, message, level } = report;

        if (level === ErrorLevel.INFO || level === ErrorLevel.WARNING) {

            return message;

        }

        const friendly = {

            network: 'Connection problem. Please check your internet.',

            permission: 'Microphone permission required.',

            validation: 'Please check your input.',

            timeout: 'Request timed out.',

            api: 'Service temporarily unavailable.',

            recognition: 'Speech recognition failed.',

            tts: 'Text-to-speech failed.',

            unknown: 'Something went wrong.'

        };

        return friendly[category] || message;

    },

    /* --------------------------------------------------
       EVENT DISPATCH
    -------------------------------------------------- */

    _dispatchEvent(report) {

        EventBus.emit('app:error', report);

    },

    /* --------------------------------------------------
       FATAL HANDLING
    -------------------------------------------------- */

    _handleFatal(report) {

        console.error('🔴 FATAL ERROR', report);

        EventBus.emit('ui:fatal', {

            message: 'A critical error occurred. Please refresh.',

            errorId: report.id

        });

        this._attemptGracefulDegradation(report);

    },

    _attemptGracefulDegradation(report) {

        if (report.context.includes('recognition')) {

            EventBus.emit('module:disable', {

                module: 'recognition',

                reason: 'fatal-error'

            });

        }

        if (report.context.includes('tts')) {

            EventBus.emit('module:disable', {

                module: 'text'

            });

        }

    },

    /* --------------------------------------------------
       HISTORY
    -------------------------------------------------- */

    _addToHistory(report) {

        errorHistory.unshift(report);

        if (errorHistory.length > MAX_HISTORY) {

            errorHistory.pop();

        }

    },

    getHistory(limit = 10) {

        return errorHistory.slice(0, limit);

    },

    clearHistory() {

        errorHistory = [];

        suppressedErrors.clear();

    },

    /* --------------------------------------------------
       SUPPRESSION
    -------------------------------------------------- */

    _isSuppressed(report) {

        const key = `${report.category}:${report.message}`;

        const ts = suppressedErrors.get(key);

        return ts && Date.now() - ts < SUPPRESS_DURATION;

    },

    _trackSuppression(report) {

        const key = `${report.category}:${report.message}`;

        suppressedErrors.set(key, report.timestamp);

        setTimeout(() => suppressedErrors.delete(key), SUPPRESS_DURATION);

    },

    /* --------------------------------------------------
       UTILITIES
    -------------------------------------------------- */

    _generateErrorId() {

        return `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    },

    getStats() {

        const stats = {

            total: errorHistory.length,

            byLevel: {},

            byCategory: {}

        };

        errorHistory.forEach(e => {

            stats.byLevel[e.level] = (stats.byLevel[e.level] || 0) + 1;

            stats.byCategory[e.category] = (stats.byCategory[e.category] || 0) + 1;

        });

        return stats;

    }

};

export default Object.freeze(ErrorHandler);