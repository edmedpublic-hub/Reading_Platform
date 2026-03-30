// static/reading/ui/utils/screen-reader.js
// PURPOSE: Screen reader announcements for accessibility

// Ensure SR-only CSS exists
function ensureSrOnlyStyles() {
    if (document.getElementById('sr-only-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'sr-only-styles';
    style.textContent = `
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
    `;
    document.head.appendChild(style);
}

// Clear announcement after delay to prevent repetition
function clearAnnouncer(announcer, delay = 3000) {
    setTimeout(() => {
        if (announcer && announcer.textContent) {
            announcer.textContent = '';
        }
    }, delay);
}

/**
 * Announce a message to screen readers
 * @param {string} message - The message to announce
 * @param {string} priority - 'polite' (default) or 'assertive'
 * @param {number} clearDelay - Milliseconds before clearing (0 = no clear)
 */
export function announceToScreenReader(message, priority = 'polite', clearDelay = 3000) {
    if (!message) return;
    
    // Ensure CSS exists
    ensureSrOnlyStyles();
    
    // Get or create announcer element
    let announcer = document.getElementById('sr-announcer');
    
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'sr-announcer';
        announcer.className = 'sr-only';
        announcer.setAttribute('aria-live', priority);
        announcer.setAttribute('aria-atomic', 'true');
        document.body.appendChild(announcer);
    } else {
        // Update priority if changed
        announcer.setAttribute('aria-live', priority);
    }
    
    // Force announcement even if same text
    announcer.textContent = '';
    
    // Use setTimeout to ensure the clear is processed
    setTimeout(() => {
        announcer.textContent = message;
        
        // Auto-clear after delay if specified
        if (clearDelay > 0) {
            clearAnnouncer(announcer, clearDelay);
        }
    }, 50);
}

/**
 * Create a dedicated announcer for a specific purpose
 * @param {string} id - Unique ID for the announcer
 * @param {string} priority - 'polite' or 'assertive'
 */
export function createAnnouncer(id, priority = 'polite') {
    // Don't duplicate
    if (document.getElementById(id)) return;
    
    ensureSrOnlyStyles();
    
    const announcer = document.createElement('div');
    announcer.id = id;
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);
    
    return {
        announce: (message, clearDelay = 3000) => {
            announcer.textContent = '';
            setTimeout(() => {
                announcer.textContent = message;
                if (clearDelay > 0) clearAnnouncer(announcer, clearDelay);
            }, 50);
        }
    };
}