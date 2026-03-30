// static/reading/ui/components/success-toast.js
// PURPOSE: Show temporary, non-intrusive notification messages

// Ensure styles are loaded
function ensureToastStyles() {
    if (document.getElementById('toast-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .toast-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 350px;
            pointer-events: none;
        }
        
        .toast-container.top {
            top: 20px;
            bottom: auto;
        }
        
        .toast-container.top-left {
            top: 20px;
            left: 20px;
            right: auto;
            bottom: auto;
        }
        
        .toast-container.top-right {
            top: 20px;
            right: 20px;
            left: auto;
            bottom: auto;
        }
        
        .toast-container.bottom-left {
            bottom: 20px;
            left: 20px;
            right: auto;
        }
        
        .toast-container.bottom-right {
            bottom: 20px;
            right: 20px;
            left: auto;
        }
            .toast.legacy {
            margin: 0.5rem 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .toast {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border-left: 4px solid;
            pointer-events: auto;
            animation: toastSlideIn 0.3s ease;
            transition: all 0.3s ease;
            max-width: 100%;
        }
        
        .toast:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }
        
        .toast.fade-out {
            animation: toastSlideOut 0.3s ease forwards;
        }
        
        @keyframes toastSlideIn {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes toastSlideOut {
            to {
                opacity: 0;
                transform: translateX(100%);
            }
        }
        
        /* RTL animations */
        [dir="rtl"] .toast {
            border-left: none;
            border-right: 4px solid;
        }
        
        [dir="rtl"] @keyframes toastSlideIn {
            from {
                opacity: 0;
                transform: translateX(-100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        [dir="rtl"] @keyframes toastSlideOut {
            to {
                opacity: 0;
                transform: translateX(-100%);
            }
        }
        
        .toast.success {
            border-left-color: #28a745;
            background: #f0fff4;
        }
        
        .toast.info {
            border-left-color: #17a2b8;
            background: #e3f2fd;
        }
        
        .toast.warning {
            border-left-color: #ffc107;
            background: #fff9e6;
        }
        
        .toast.error {
            border-left-color: #dc3545;
            background: #fff5f5;
        }
        
        [dir="rtl"] .toast.success { border-right-color: #28a745; }
        [dir="rtl"] .toast.info { border-right-color: #17a2b8; }
        [dir="rtl"] .toast.warning { border-right-color: #ffc107; }
        [dir="rtl"] .toast.error { border-right-color: #dc3545; }
        
        .toast-icon {
            font-size: 1.25rem;
            line-height: 1;
        }
        
        .toast-content {
            flex: 1;
        }
        
        .toast-message {
            margin: 0;
            font-size: 0.95rem;
            color: #333;
        }
        
        .toast-description {
            margin: 4px 0 0;
            font-size: 0.85rem;
            color: #666;
        }
        
        .toast-close {
            background: none;
            border: none;
            padding: 4px;
            cursor: pointer;
            opacity: 0.5;
            transition: opacity 0.2s;
            font-size: 1.1rem;
            line-height: 1;
            color: #666;
        }
        
        .toast-close:hover {
            opacity: 1;
        }
        
        .toast-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: rgba(0, 0, 0, 0.1);
            width: 100%;
        }
        
        .toast-progress-bar {
            height: 100%;
            width: 100%;
            transform-origin: left;
            animation: progressShrink linear forwards;
        }
        
        .toast.success .toast-progress-bar { background: #28a745; }
        .toast.info .toast-progress-bar { background: #17a2b8; }
        .toast.warning .toast-progress-bar { background: #ffc107; }
        .toast.error .toast-progress-bar { background: #dc3545; }
        
        [dir="rtl"] .toast-progress-bar {
            transform-origin: right;
        }
        
        @keyframes progressShrink {
            from { width: 100%; }
            to { width: 0%; }
        }
    `;
    document.head.appendChild(style);
}

// Toast container singleton
let toastContainer = null;

// Track active toasts
const activeToasts = new Set();

/**
 * Get or create toast container
 */
function getToastContainer(position = 'bottom-right') {
    if (toastContainer) return toastContainer;
    
    toastContainer = document.createElement('div');
    toastContainer.className = `toast-container ${position}`;
    document.body.appendChild(toastContainer);
    
    return toastContainer;
}

/**
 * Show a toast notification
 * @param {string} message - Main message
 * @param {Object} options - Toast options
 * @param {string} options.type - 'success', 'info', 'warning', 'error'
 * @param {string} options.description - Secondary description
 * @param {number} options.timeout - Auto-hide timeout (0 = no auto-hide)
 * @param {string} options.position - Toast position
 * @param {string} options.containerId - Legacy container ID (for backward compatibility)
 * @param {boolean} options.showProgress - Show progress bar
 * @param {boolean} options.showClose - Show close button
 * @param {Function} options.onClick - Click callback
 * @param {Function} options.onClose - Close callback
 * @param {string} options.language - 'en' or 'ar'
 * @returns {HTMLElement} The toast element
 */
export function showToast(message, options = {}) {
    const {
        type = 'success',
        description = '',
        timeout = 3000,
        position = 'bottom-right',
        containerId = null,
        showProgress = true,
        showClose = true,
        onClick = null,
        onClose = null,
        language = 'en'
    } = options;

    // Ensure styles exist
    ensureToastStyles();

    // Check for RTL
    if (language === 'ar' || /[\u0600-\u06FF]/.test(message)) {
        document.documentElement.setAttribute('dir', 'rtl');
    }

    // Handle legacy containerId (backward compatibility)
    if (containerId) {
        const legacyContainer = document.getElementById(containerId);
        if (legacyContainer) {
            return showLegacyToast(message, type, timeout, legacyContainer);
        }
    }

    // Get or create toast container
    const container = getToastContainer(position);

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    // Get icon based on type
    const icon = getToastIcon(type, language);

    // Build content
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icon;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'toast-content';

    const messageP = document.createElement('p');
    messageP.className = 'toast-message';
    messageP.textContent = message;

    contentDiv.appendChild(messageP);

    if (description) {
        const descP = document.createElement('p');
        descP.className = 'toast-description';
        descP.textContent = description;
        contentDiv.appendChild(descP);
    }

    toast.appendChild(iconSpan);
    toast.appendChild(contentDiv);

    // Add close button
    if (showClose) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.innerHTML = '✕';
        closeBtn.setAttribute('aria-label', language === 'ar' ? 'إغلاق' : 'Close');
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            removeToast(toast, onClose);
        };
        toast.appendChild(closeBtn);
    }

    // Add progress bar
    if (showProgress && timeout > 0) {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'toast-progress';
        
        const progressBar = document.createElement('div');
        progressBar.className = 'toast-progress-bar';
        progressBar.style.animationDuration = `${timeout}ms`;
        
        progressDiv.appendChild(progressBar);
        toast.appendChild(progressDiv);
    }

    // Add click handler
    if (onClick) {
        toast.style.cursor = 'pointer';
        toast.addEventListener('click', onClick);
    }

    // Add to container
    container.appendChild(toast);
    activeToasts.add(toast);

    // Auto-remove after timeout
    if (timeout > 0) {
        setTimeout(() => {
            removeToast(toast, onClose);
        }, timeout);
    }

    return toast;
}

/**
 * Show success toast (legacy function)
 * @param {string} message - Success message
 * @param {string} containerId - Container element ID
 * @param {number} timeout - Auto-hide timeout in ms
 */
export function showSuccess(message, containerId = 'feedbackContainer', timeout = 3000) {
    // Check if using legacy container
    const container = document.getElementById(containerId);
    if (container) {
        return showLegacyToast(message, 'success', timeout, container);
    }

    // Use new toast system
    return showToast(message, {
        type: 'success',
        timeout,
        position: 'bottom-right'
    });
}

/**
 * Legacy toast support (appends to container)
 */
function showLegacyToast(message, type, timeout, container) {
    const toast = document.createElement('div');
    toast.className = `toast ${type} legacy`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    
    container.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, timeout);
    
    return toast;
}

/**
 * Remove toast with animation
 */
function removeToast(toast, onClose = null) {
    if (!toast || !toast.parentNode) return;
    
    toast.classList.add('fade-out');
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
            activeToasts.delete(toast);
            if (onClose) onClose();
        }
    }, 300);
}

/**
 * Get icon based on toast type
 */
function getToastIcon(type, language) {
    const icons = {
        success: language === 'ar' ? '✅' : '✓',
        info: language === 'ar' ? 'ℹ️' : 'ℹ',
        warning: language === 'ar' ? '⚠️' : '⚠',
        error: language === 'ar' ? '❌' : '✕'
    };
    return icons[type] || icons.success;
}

/**
 * Show info toast
 */
export function showInfo(message, options = {}) {
    return showToast(message, { ...options, type: 'info' });
}

/**
 * Show warning toast
 */
export function showWarning(message, options = {}) {
    return showToast(message, { ...options, type: 'warning' });
}

/**
 * Show error toast
 */
export function showError(message, options = {}) {
    return showToast(message, { ...options, type: 'error' });
}

/**
 * Clear all toasts
 */
export function clearAllToasts() {
    activeToasts.forEach(toast => {
        if (toast.parentNode) {
            toast.remove();
        }
    });
    activeToasts.clear();
}

/**
 * Remove toast by ID or element
 */
export function removeToastById(toastId) {
    const toast = typeof toastId === 'string' 
        ? document.getElementById(toastId) 
        : toastId;
    
    if (toast) {
        removeToast(toast);
    }
}

export default {
    showToast,
    showSuccess,
    showInfo,
    showWarning,
    showError,
    clearAllToasts,
    removeToastById
};