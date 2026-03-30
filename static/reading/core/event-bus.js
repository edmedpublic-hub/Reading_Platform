// static/reading/core/event-bus.js
// PURPOSE: Centralized event system. Acting as the communication backbone.

const listeners = new Map();
const wildcardListeners = [];
const eventHistory = [];

const MAX_HISTORY = 50;
const MAX_LISTENERS_PER_EVENT = 20;

const issuedWarnings = new Set();

/**
 * Utility
 */
function warnNamespace(event) {
    if (!event.includes(':') && !issuedWarnings.has(event)) {
        console.warn(`⚠️ Event "${event}" is not namespaced. Recommended format: "module:event"`);
        issuedWarnings.add(event);
    }
}

/**
 * Record history
 */
function recordHistory(event, detail) {

    eventHistory.unshift({
        event,
        detail,
        timestamp: detail?.timestamp || Date.now()
    });

    if (eventHistory.length > MAX_HISTORY) {
        eventHistory.pop();
    }

}

/**
 * Replay history
 */
function replayHistory(event, callback) {
    eventHistory.forEach(({ event: hEvent, detail }) => {
        if (hEvent === event || event === '*') {
            queueMicrotask(() => callback({ type: hEvent, detail }));
        }
    });
}

/**
 * Execute listeners
 */
function executeListeners(event, payload) {
    const errors = [];

    // Wildcard listeners
    wildcardListeners.forEach(listener => {
        const { pattern, callback } = listener;

        if (
            pattern === '*' ||
            (pattern instanceof RegExp && pattern.test(event))
        ) {
            try {
                callback({ type: event, detail: payload });
            } catch (error) {
                errors.push({ listener: 'wildcard', error });
            }
        }
    });

    // Direct listeners
    const eventListeners = listeners.get(event) || [];

    eventListeners.forEach(listener => {
        try {
            listener.callback({ type: event, detail: payload });

            if (listener.once) {
                EventBus.off(event, listener.callback);
            }

        } catch (error) {
            errors.push({
                listener: listener.callback.name || 'anonymous',
                error
            });
        }
    });

    if (errors.length) {
        console.error(`❌ EventBus error in "${event}"`, errors);

        // Emit system error event
        if (event !== 'system:error') {
            EventBus.emit("system:error", {
                sourceEvent: event,
                errors
            }, { record: false });
        }
    }
}

/**
 * EventBus Singleton
 */
export const EventBus = {

    /**
     * Register listener
     */
    on(event, callback, options = {}) {

        const {
            priority = 0,
            once = false,
            replayHistory: shouldReplay = false
        } = options;

        warnNamespace(event);

        // Wildcard listeners
        if (event === '*' || event instanceof RegExp) {
            wildcardListeners.push({
                pattern: event,
                callback,
                priority
            });

            return this;
        }

        if (!listeners.has(event)) {
            listeners.set(event, []);
        }

        const eventListeners = listeners.get(event);

        // Prevent duplicates
        if (eventListeners.some(l => l.callback === callback)) {
            return this;
        }

        eventListeners.push({
            callback,
            priority,
            once
        });

        // Priority ordering
        eventListeners.sort((a, b) => b.priority - a.priority);

        if (eventListeners.length > MAX_LISTENERS_PER_EVENT) {
            console.warn(`⚠️ Event "${event}" has ${eventListeners.length} listeners`);
        }

        if (shouldReplay) {
            replayHistory(event, callback);
        }

        return this;
    },

    /**
     * Once listener
     */
    once(event, callback, options = {}) {
        return this.on(event, callback, { ...options, once: true });
    },

    /**
     * Remove listener
     */
    off(event, callback) {

        if (listeners.has(event)) {

            const filtered = listeners
                .get(event)
                .filter(l => l.callback !== callback);

            if (filtered.length) {
                listeners.set(event, filtered);
            } else {
                listeners.delete(event);
            }
        }

        // Remove wildcard listener
        for (let i = wildcardListeners.length - 1; i >= 0; i--) {
            if (wildcardListeners[i].callback === callback) {
                wildcardListeners.splice(i, 1);
            }
        }

        return this;
    },

    /**
     * Emit event
     */
    emit(event, detail = {}, options = {}) {

        const {
            async = false,
            record = true
        } = options;

        warnNamespace(event);

        const payload = {
            ...detail,
            event,
            timestamp: Date.now()
        };

        if (record) {
            recordHistory(event, payload);
        }

        if (async) {
            queueMicrotask(() => executeListeners(event, payload));
        } else {
            executeListeners(event, payload);
        }
        
    },

    /**
     * Clear all listeners (debug use)
     */
        /**
     * Clear all listeners (debug use)
     */
    clear() {

        listeners.clear();
        wildcardListeners.length = 0;
        eventHistory.length = 0;

        console.warn("⚠️ EventBus cleared (all listeners removed)");

    },

    /**
     * Debug helper - count listeners
     */
    getListenerCount(event) {

        if (event === '*') {
            return wildcardListeners.length;
        }

        if (!listeners.has(event)) {
            return 0;
        }

        return listeners.get(event).length;

    },
    
};


// DevTools debugging
if (typeof window !== "undefined") {
    window.__ReadingEventBus = EventBus;
}

export default Object.freeze(EventBus);