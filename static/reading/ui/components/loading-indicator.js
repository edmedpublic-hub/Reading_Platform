// static/reading/ui/components/loading-indicator.js
// PURPOSE: Show/hide loading indicators with multiple styles

import { escapeHtml } from '../utils/html-escaper.js';
import { createElement } from '../utils/dom-creator.js';

// Ensure styles are loaded
function ensureLoadingStyles() {
    if (document.getElementById('loading-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'loading-styles';
    style.textContent = `
        .loading-indicator {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            text-align: center;
            animation: loadingFadeIn 0.3s ease;
        }
        
        .loading-indicator.overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.9);
            z-index: 9999;
            margin: 0;
        }
        
        @keyframes loadingFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
        
        @keyframes loadingFadeOut {
            to { opacity: 0; transform: scale(0.95); }
        }
        
        .loading-indicator.fade-out {
            animation: loadingFadeOut 0.2s ease forwards;
        }
        
        /* Spinner styles */
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 1rem;
        }
        
        .spinner.small {
            width: 20px;
            height: 20px;
            border-width: 3px;
        }
        
        .spinner.large {
            width: 60px;
            height: 60px;
            border-width: 5px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Progress bar styles */
        .progress-bar {
            width: 100%;
            max-width: 300px;
            height: 20px;
            background: #f0f0f0;
            border-radius: 10px;
            overflow: hidden;
            margin: 1rem 0;
        }
        
        .progress-fill {
            height: 100%;
            background: #3498db;
            transition: width 0.3s ease;
            border-radius: 10px;
        }
        
        /* Dot pulse animation */
        .dot-pulse {
            display: flex;
            gap: 0.5rem;
            margin: 1rem 0;
        }
        
        .dot-pulse div {
            width: 12px;
            height: 12px;
            background: #3498db;
            border-radius: 50%;
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        .dot-pulse div:nth-child(2) { animation-delay: 0.2s; }
        .dot-pulse div:nth-child(3) { animation-delay: 0.4s; }
        
        @keyframes pulse {
            0%, 100% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
        }
        
        /* Message styles */
        .loading-message {
            color: #666;
            font-size: 1rem;
            margin: 0.5rem 0;
        }
        
        .loading-submessage {
            color: #999;
            font-size: 0.875rem;
        }
        
        /* Skeleton loading */
        .skeleton-loader {
            width: 100%;
            padding: 1rem;
        }
        
        .skeleton-line {
            height: 1rem;
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: 4px;
            margin: 0.5rem 0;
        }
        
        .skeleton-line:nth-child(2) { width: 90%; }
        .skeleton-line:nth-child(3) { width: 95%; }
        .skeleton-line:nth-child(4) { width: 85%; }
        
        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
    `;
    document.head.appendChild(style);
}

// Store active loaders for cleanup
const activeLoaders = new Map();

/**
 * Show loading indicator with multiple styles
 * @param {Object} options - Loading options
 * @param {string} options.message - Main loading message
 * @param {string} options.submessage - Secondary message
 * @param {string} options.type - 'spinner', 'progress', 'dots', 'skeleton'
 * @param {string} options.size - 'small', 'medium', 'large'
 * @param {string} options.containerId - Container element ID
 * @param {boolean} options.overlay - Show as full-page overlay
 * @param {number} options.minDisplayTime - Minimum display time (ms)
 * @param {number} options.timeout - Auto-hide after timeout (ms)
 * @param {Function} options.onTimeout - Callback when auto-hidden
 * @returns {string} Loader ID for later reference
 */
export function showLoading(options = {}) {
    const {
        message = 'Loading...',
        submessage = '',
        type = 'spinner',
        size = 'medium',
        containerId = 'feedbackContainer',
        overlay = false,
        minDisplayTime = 0,
        timeout = 0,
        onTimeout = null
    } = options;

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return null;
    }

    // Ensure styles exist
    ensureLoadingStyles();

    // Generate unique ID for this loader
    const loaderId = `loader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create loader element
    const loaderEl = createElement('div', {
        id: loaderId,
        className: `loading-indicator ${overlay ? 'overlay' : ''}`,
        role: 'status',
        'aria-live': 'polite',
        'aria-label': message
    });

    // Add loading animation based on type
    switch (type) {
        case 'spinner':
            loaderEl.appendChild(createElement('div', { className: `spinner ${size}` }));
            break;
            
        case 'dots':
            const dotsContainer = createElement('div', { className: 'dot-pulse' });
            for (let i = 0; i < 3; i++) {
                dotsContainer.appendChild(createElement('div'));
            }
            loaderEl.appendChild(dotsContainer);
            break;
            
        case 'progress':
            const progressBar = createElement('div', { className: 'progress-bar' }, [
                createElement('div', { 
                    className: 'progress-fill',
                    style: { width: '0%' }
                })
            ]);
            loaderEl.appendChild(progressBar);
            break;
            
        case 'skeleton':
            const skeleton = createElement('div', { className: 'skeleton-loader' });
            for (let i = 0; i < 4; i++) {
                skeleton.appendChild(createElement('div', { className: 'skeleton-line' }));
            }
            loaderEl.appendChild(skeleton);
            break;
    }

    // Add message
    if (message) {
        loaderEl.appendChild(createElement('p', { className: 'loading-message' }, escapeHtml(message)));
    }
    
    if (submessage) {
        loaderEl.appendChild(createElement('p', { className: 'loading-submessage' }, escapeHtml(submessage)));
    }

    // Hide any existing loader first (but don't clear container completely)
    hideLoading(containerId);

    // Add to container (append, don't replace)
    container.appendChild(loaderEl);

    // Store loader info
    const loaderInfo = {
        element: loaderEl,
        containerId,
        startTime: Date.now(),
        minDisplayTime,
        timeoutId: null
    };

    // Set timeout if specified
    if (timeout > 0) {
        loaderInfo.timeoutId = setTimeout(() => {
            if (document.getElementById(loaderId)) {
                hideLoading(containerId, loaderId);
                if (onTimeout) onTimeout();
            }
        }, timeout);
    }

    activeLoaders.set(loaderId, loaderInfo);

    return loaderId;
}

/**
 * Update loading progress (for progress bar type)
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} loaderId - Specific loader ID (optional)
 * @param {string} containerId - Container ID if no loaderId
 */
export function updateProgress(percent, loaderId = null, containerId = 'feedbackContainer') {
    let loaderEl;
    
    if (loaderId) {
        loaderEl = document.getElementById(loaderId);
    } else {
        const container = document.getElementById(containerId);
        loaderEl = container?.querySelector('.loading-indicator');
    }
    
    if (!loaderEl) return;
    
    const progressFill = loaderEl.querySelector('.progress-fill');
    if (progressFill) {
        progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
}

/**
 * Hide loading indicator
 * @param {string} containerId - Container element ID
 * @param {string} loaderId - Specific loader ID (optional)
 * @param {boolean} immediate - Skip animation
 */
export function hideLoading(containerId = 'feedbackContainer', loaderId = null, immediate = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const hideElement = (element) => {
        if (!element || !element.parentNode) return;
        
        if (immediate) {
            element.remove();
        } else {
            element.classList.add('fade-out');
            setTimeout(() => {
                if (element.parentNode) {
                    element.remove();
                }
            }, 200);
        }
    };
    
    if (loaderId) {
        // Hide specific loader
        const loaderEl = document.getElementById(loaderId);
        hideElement(loaderEl);
        
        // Clean up from map
        const loaderInfo = activeLoaders.get(loaderId);
        if (loaderInfo?.timeoutId) {
            clearTimeout(loaderInfo.timeoutId);
        }
        activeLoaders.delete(loaderId);
    } else {
        // Hide all loaders in container
        const loaders = container.querySelectorAll('.loading-indicator');
        loaders.forEach(loader => {
            // Find and clean up associated timeout
            for (const [id, info] of activeLoaders.entries()) {
                if (info.element === loader) {
                    if (info.timeoutId) clearTimeout(info.timeoutId);
                    activeLoaders.delete(id);
                    break;
                }
            }
            hideElement(loader);
        });
    }
}

/**
 * Ensure minimum display time for loader
 * @param {string} loaderId - Loader ID
 * @param {Function} callback - Function to call after min time
 */
async function ensureMinDisplayTime(loaderId, callback) {
    const loaderInfo = activeLoaders.get(loaderId);
    if (!loaderInfo) {
        callback();
        return;
    }
    
    const elapsed = Date.now() - loaderInfo.startTime;
    if (elapsed >= loaderInfo.minDisplayTime) {
        callback();
    } else {
        setTimeout(callback, loaderInfo.minDisplayTime - elapsed);
    }
}

/**
 * Show loading with automatic cleanup after async operation
 * @param {Function} asyncFn - Async function to execute
 * @param {Object} options - Loading options (same as showLoading)
 * @returns {Promise} Result of asyncFn
 */
export async function withLoading(asyncFn, options = {}) {
    const loaderId = showLoading(options);
    
    try {
        const result = await asyncFn();
        
        await new Promise(resolve => {
            ensureMinDisplayTime(loaderId, () => {
                hideLoading(options.containerId, loaderId);
                resolve();
            });
        });
        
        return result;
    } catch (error) {
        hideLoading(options.containerId, loaderId);
        throw error;
    }
}

/**
 * Show skeleton loader for content
 * @param {string} containerId - Container element ID
 * @param {number} lines - Number of skeleton lines
 */
export function showSkeleton(containerId = 'feedbackContainer', lines = 4) {
    return showLoading({
        type: 'skeleton',
        containerId,
        message: '',
        overlay: false
    });
}

export default {
    showLoading,
    hideLoading,
    updateProgress,
    withLoading,
    showSkeleton
};