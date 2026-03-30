// static/reading/ui/components/error-display.js
// PURPOSE: Display classroom-friendly error messages

import { escapeHtml } from '../utils/html-escaper.js';
import { createElement } from '../utils/dom-creator.js';

// Ensure styles are loaded
function ensureErrorStyles() {
    if (document.getElementById('error-display-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'error-display-styles';
    style.textContent = `
        .classroom-error {
            display: flex;
            gap: 1rem;
            padding: 1.5rem;
            margin: 1rem 0;
            background: #fff8e7;
            border: 2px solid #ffc107;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .classroom-error.error-hidden {
            animation: slideOut 0.3s ease-out forwards;
        }
        
        @keyframes slideOut {
            to {
                opacity: 0;
                transform: translateY(-20px);
            }
        }
        
        .error-icon {
            font-size: 3rem;
            line-height: 1;
        }
        
        .error-content {
            flex: 1;
        }
        
        .error-title {
            margin: 0 0 0.5rem 0;
            font-size: 1.25rem;
            font-weight: 600;
            color: #856404;
        }
        
        .error-message {
            margin: 0 0 1rem 0;
            font-size: 1rem;
            color: #333;
        }
        
        .error-tips {
            margin: 0 0 1.5rem 0;
            padding: 0;
            list-style: none;
        }
        
        .error-tips li {
            padding: 0.25rem 0;
            color: #555;
            font-size: 0.95rem;
        }
        
        .error-tips li::before {
            content: "💡";
            margin-right: 0.5rem;
        }
        
        .error-actions {
            display: flex;
            gap: 0.75rem;
        }
        
        .btn-retry, .btn-help {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 6px;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .btn-retry {
            background: #ffc107;
            color: #333;
        }
        
        .btn-retry:hover {
            background: #e0a800;
            transform: scale(1.02);
        }
        
        .btn-help {
            background: #f8f9fa;
            color: #666;
            border: 1px solid #ddd;
        }
        
        .btn-help:hover {
            background: #e9ecef;
        }
        
        /* RTL Support */
        [dir="rtl"] .classroom-error {
            flex-direction: row-reverse;
        }
        
        [dir="rtl"] .error-tips li::before {
            margin-right: 0;
            margin-left: 0.5rem;
        }
        
        [dir="rtl"] .error-actions {
            flex-direction: row-reverse;
        }
    `;
    document.head.appendChild(style);
}

// Error message templates for classroom use
const errorTemplates = {
    // Network/Connection errors
    network: {
        icon: '📶',
        title: 'Connection Issue',
        mainMessage: "We're having trouble connecting to the lesson.",
        tips: [
            'Check your internet connection',
            'Wait a moment and try again',
            'Ask your teacher for help'
        ]
    },
    // Server errors (500, 503)
    server: {
        icon: '🔧',
        title: 'Technical Glitch',
        mainMessage: "Our system hit a small bump. Don't worry!",
        tips: [
            'Try again in a minute',
            'Your progress is safely saved',
            'Tell your teacher if this keeps happening'
        ]
    },
    // Permission errors (microphone)
    microphone: {
        icon: '🎤',
        title: 'Microphone Access Needed',
        mainMessage: "We can't hear you yet.",
        tips: [
            'Click the microphone icon in your browser',
            'Select "Allow" when asked',
            'Refresh the page after allowing'
        ]
    },
    // No speech detected
    nospeech: {
        icon: '🔇',
        title: 'No Speech Detected',
        mainMessage: "We didn't hear anything.",
        tips: [
            'Make sure your microphone is on',
            'Speak clearly into the microphone',
            'Try moving closer to your device'
        ]
    },
    // Lesson loading errors
    lesson: {
        icon: '📚',
        title: 'Lesson Unavailable',
        mainMessage: "This lesson can't be opened right now.",
        tips: [
            'Check that the lesson ID is correct',
            'Try a different lesson',
            'Ask your teacher for help'
        ]
    },
    // Recognition/API errors
    recognition: {
        icon: '🎙️',
        title: 'Speech Recognition Issue',
        mainMessage: "We're having trouble understanding you.",
        tips: [
            'Speak more clearly',
            'Reduce background noise',
            'Try again in a moment'
        ]
    },
    // Timeout errors
    timeout: {
        icon: '⏰',
        title: 'Taking Too Long',
        mainMessage: "The lesson is taking longer than expected.",
        tips: [
            'Try again now',
            'Refresh the page if it continues',
            'Your work is automatically saved'
        ]
    },
    // Default fallback
    default: {
        icon: '❓',
        title: 'Something Unexpected Happened',
        mainMessage: "Don't worry - these things happen!",
        tips: [
            'Try refreshing the page',
            'Come back to it in a few minutes',
            'Your teacher has been notified'
        ]
    }
};

/**
 * Show user-friendly error message (classroom-optimized)
 * @param {string} message - Technical error message
 * @param {Object} options - Configuration options
 * @param {string} options.containerId - Container element ID
 * @param {Function} options.retryCallback - Optional retry function
 * @param {number} options.autoHide - Auto-hide after milliseconds (0 = no auto-hide)
 * @param {string} options.helpUrl - Custom help URL
 * @param {boolean} options.replaceExisting - Replace existing error
 */
export function showError(message, options = {}) {
    const {
        containerId = 'feedbackContainer',
        retryCallback = null,
        autoHide = 0,
        helpUrl = '/help/',
        replaceExisting = true
    } = options;

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return;
    }

    // Ensure styles exist
    ensureErrorStyles();

    // Check for RTL
    const hasArabic = /[\u0600-\u06FF]/.test(message);
    if (hasArabic) {
        container.setAttribute('dir', 'auto');
    }

    // Remove existing error if replacing
    if (replaceExisting) {
        clearError(containerId);
    } else {
        // Check if error already exists
        if (container.querySelector('.classroom-error')) {
            return;
        }
    }

    // Convert technical messages to classroom-friendly ones
    const friendlyError = getFriendlyErrorMessage(message);
    
    // Create error element
    const errorEl = createElement('div', {
        className: 'classroom-error',
        role: 'alert',
        'aria-live': 'assertive'
    });
    
    // Icon
    const iconDiv = createElement('div', { className: 'error-icon' }, friendlyError.icon);
    
    // Content
    const contentDiv = createElement('div', { className: 'error-content' });
    
    // Title
    contentDiv.appendChild(createElement('h4', { className: 'error-title' }, friendlyError.title));
    
    // Message
    contentDiv.appendChild(createElement('p', { className: 'error-message' }, friendlyError.mainMessage));
    
    // Tips
    if (friendlyError.tips && friendlyError.tips.length) {
        const tipsList = createElement('ul', { className: 'error-tips' });
        friendlyError.tips.forEach(tip => {
            tipsList.appendChild(createElement('li', {}, tip));
        });
        contentDiv.appendChild(tipsList);
    }
    
    // Actions
    const actionsDiv = createElement('div', { className: 'error-actions' });
    
    // Retry button
    if (retryCallback && typeof retryCallback === 'function') {
        const retryBtn = createElement('button', {
            className: 'btn-retry',
            onclick: () => {
                hideError(containerId);
                setTimeout(retryCallback, 100);
            }
        }, 'Try Again');
        actionsDiv.appendChild(retryBtn);
    }
    
    // Help button
    const helpBtn = createElement('button', {
        className: 'btn-help',
        onclick: () => {
            window.location.href = helpUrl;
        }
    }, 'Get Help');
    actionsDiv.appendChild(helpBtn);
    
    contentDiv.appendChild(actionsDiv);
    
    // Assemble
    errorEl.appendChild(iconDiv);
    errorEl.appendChild(contentDiv);
    
    // Add to container
    container.appendChild(errorEl);
    
    // Log for teachers (invisible to students)
    console.log('📝 Classroom error logged:', {
        type: friendlyError.logType || 'unknown',
        message: friendlyError.logMessage || message,
        timestamp: new Date().toISOString(),
        url: window.location.href
    });
    
    // Auto-hide if specified
    if (autoHide > 0) {
        setTimeout(() => {
            hideError(containerId);
        }, autoHide);
    }
    
    return errorEl;
}

/**
 * Hide error with animation
 * @param {string} containerId - Container element ID
 */
export function hideError(containerId = 'feedbackContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const errorEl = container.querySelector('.classroom-error');
    if (errorEl) {
        errorEl.classList.add('error-hidden');
        setTimeout(() => {
            if (errorEl.parentNode) {
                errorEl.remove();
            }
        }, 300);
    }
}

/**
 * Clear all errors from container
 * @param {string} containerId - Container element ID
 */
export function clearError(containerId = 'feedbackContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const errors = container.querySelectorAll('.classroom-error');
    errors.forEach(error => error.remove());
}

/**
 * Convert technical errors to classroom-friendly messages
 * @param {string} technical - Technical error message
 * @returns {Object} Friendly error template
 */
export function getFriendlyErrorMessage(technical) {
    const error = String(technical).toLowerCase();
    
    // Network/Connection errors
    if (error.includes('network') || error.includes('fetch') || error.includes('connection') || error.includes('offline')) {
        return {
            ...errorTemplates.network,
            logType: 'network',
            logMessage: 'Network error - student may have connectivity issues'
        };
    }
    
    // Server errors (500, 503)
    if (error.includes('500') || error.includes('503') || error.includes('502') || error.includes('server')) {
        return {
            ...errorTemplates.server,
            logType: 'server',
            logMessage: `Server error: ${technical}`
        };
    }
    
    // Permission errors (microphone)
    if (error.includes('microphone') || error.includes('permission') || error.includes('denied') || error.includes('not allowed')) {
        return {
            ...errorTemplates.microphone,
            logType: 'permission',
            logMessage: 'Microphone permission denied'
        };
    }
    
    // No speech detected
    if (error.includes('no speech') || error.includes('silence') || error.includes('no audio')) {
        return {
            ...errorTemplates.nospeech,
            logType: 'nospeech',
            logMessage: 'No speech detected during recording'
        };
    }
    
    // Lesson loading errors
    if (error.includes('lesson') || error.includes('404') || error.includes('not found') || error.includes('missing')) {
        return {
            ...errorTemplates.lesson,
            logType: 'lesson',
            logMessage: `Lesson not found: ${technical}`
        };
    }
    
    // Recognition errors
    if (error.includes('recognition') || error.includes('speech') || error.includes('recognition')) {
        return {
            ...errorTemplates.recognition,
            logType: 'recognition',
            logMessage: `Speech recognition error: ${technical}`
        };
    }
    
    // Timeout errors
    if (error.includes('timeout') || error.includes('timed out') || error.includes('aborted')) {
        return {
            ...errorTemplates.timeout,
            logType: 'timeout',
            logMessage: `Operation timeout: ${technical}`
        };
    }
    
    // Default fallback
    return {
        ...errorTemplates.default,
        logType: 'unhandled',
        logMessage: `Unhandled error: ${technical}`
    };
}

/**
 * Show temporary success message (for recoverable errors)
 * @param {string} message - Success message
 * @param {string} containerId - Container element ID
 */
export function showSuccess(message, containerId = 'feedbackContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const successEl = createElement('div', {
        className: 'classroom-error success-message',
        role: 'status',
        'aria-live': 'polite'
    }, [
        createElement('div', { className: 'error-icon' }, '✅'),
        createElement('div', { className: 'error-content' }, [
            createElement('p', { className: 'error-message' }, message)
        ])
    ]);
    
    container.appendChild(successEl);
    
    setTimeout(() => {
        if (successEl.parentNode) {
            successEl.classList.add('error-hidden');
            setTimeout(() => successEl.remove(), 300);
        }
    }, 3000);
}

export default {
    showError,
    hideError,
    clearError,
    showSuccess,
    getFriendlyErrorMessage
};