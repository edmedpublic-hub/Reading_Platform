// static/reading/ui/components/progress-bar.js
// PURPOSE: Manage reading progress visualization with dual-mode support

// Ensure styles are loaded
function ensureProgressStyles() {
    if (document.getElementById('progress-bar-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'progress-bar-styles';
    style.textContent = `
        .progress-container {
            width: 100%;
            margin: 1rem 0;
            position: relative;
        }
        
        .progress-labels {
            display: flex;
            justify-content: space-between;
            margin-bottom: 0.5rem;
            font-size: 0.875rem;
            color: #666;
        }
        
        .progress-mode-label {
            font-weight: 600;
            color: #333;
        }
        
        .progress-percentage {
            font-family: monospace;
            background: #f0f0f0;
            padding: 0.125rem 0.5rem;
            border-radius: 12px;
        }
        
        .progress-track {
            width: 100%;
            height: 24px;
            background-color: #e9ecef;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .progress-bar {
            height: 100%;
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 12px;
            position: relative;
            overflow: hidden;
        }
        
        .progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
                90deg,
                rgba(255,255,255,0.1) 0%,
                rgba(255,255,255,0.3) 50%,
                rgba(255,255,255,0.1) 100%
            );
            animation: shimmer 2s infinite;
        }
        
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        .progress-bar-striped {
            background-image: linear-gradient(
                45deg,
                rgba(255,255,255,0.15) 25%,
                transparent 25%,
                transparent 50%,
                rgba(255,255,255,0.15) 50%,
                rgba(255,255,255,0.15) 75%,
                transparent 75%,
                transparent
            );
            background-size: 1rem 1rem;
        }
        
        .progress-bar.bg-primary { background-color: #007bff; }
        .progress-bar.bg-success { background-color: #28a745; }
        .progress-bar.bg-info { background-color: #17a2b8; }
        .progress-bar.bg-warning { background-color: #ffc107; }
        .progress-bar.bg-danger { background-color: #dc3545; }
        
        .progress-details {
            display: flex;
            gap: 1rem;
            margin-top: 0.5rem;
            font-size: 0.75rem;
            color: #999;
        }
        
        .progress-detail-item {
            display: flex;
            align-items: center;
            gap: 0.25rem;
        }
        
        .detail-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .detail-dot.tts { background-color: #007bff; }
        .detail-dot.practice { background-color: #28a745; }
        
        .visually-hidden {
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

// Private state for this module
let progressState = {
    ttsProgress: 0,
    practiceProgress: 0,
    overallProgress: 0,
    mode: 'tts',
    lastUpdated: Date.now(),
    animationFrame: null,
    weights: {
        tts: 0.3,      // TTS contributes 30%
        practice: 0.7  // Practice contributes 70%
    }
};

// Store event listeners for cleanup
let eventListeners = [];

/**
 * Update progress bar based on TTS or practice progress
 * @param {string} mode - 'tts', 'practice', or 'combined'
 * @param {number} value - Progress value (0-100)
 * @param {Object} options - Additional options
 */
export function updateProgressBar(mode, value, options = {}) {
    const {
        animate = true,
        force = false,
        source = 'user'
    } = options;

    const progressBar = document.getElementById('readingProgressBar');
    const progressTrack = progressBar?.closest('.progress-track');
    const container = document.getElementById('readingProgressContainer');
    
    if (!progressBar) {
        console.warn('Progress bar element not found');
        return false;
    }

    // Ensure styles exist
    ensureProgressStyles();

    // Validate value
    value = Math.min(100, Math.max(0, Number(value) || 0));

    // Update state based on mode
    let stateChanged = false;
    
    if (mode === 'tts') {
        if (progressState.ttsProgress !== value) {
            progressState.ttsProgress = value;
            stateChanged = true;
        }
    } else if (mode === 'practice') {
        if (progressState.practiceProgress !== value) {
            progressState.practiceProgress = value;
            stateChanged = true;
        }
    }

    // Skip if no change and not forced
    if (!stateChanged && !force) return true;

    // Calculate overall progress using weights
    const newOverall = calculateOverallProgress();
    progressState.overallProgress = newOverall;
    progressState.lastUpdated = Date.now();
    progressState.mode = mode;

    // Update the DOM with animation
    const displayValue = Math.round(progressState.overallProgress);
    
    if (animate) {
        animateProgressChange(progressBar, displayValue);
    } else {
        progressBar.style.width = `${displayValue}%`;
    }

    // Update ARIA attributes
    progressBar.setAttribute('aria-valuenow', displayValue);
    
    // Update hidden text for screen readers
    let srSpan = progressBar.querySelector('.visually-hidden');
    if (!srSpan) {
        srSpan = document.createElement('span');
        srSpan.className = 'visually-hidden';
        progressBar.appendChild(srSpan);
    }
    srSpan.textContent = `${displayValue}% complete`;

    // Update color based on progress
    updateProgressBarColor(progressBar, displayValue);

    // Update detail labels if container exists
    if (container) {
        updateProgressLabels(container, displayValue);
    }

    // Dispatch event for other modules
    document.dispatchEvent(new CustomEvent('progress-updated', {
        detail: { 
            tts: progressState.ttsProgress,
            practice: progressState.practiceProgress,
            overall: progressState.overallProgress,
            mode,
            source,
            timestamp: progressState.lastUpdated
        }
    }));

    return true;
}

/**
 * Calculate overall progress using weights
 */
function calculateOverallProgress() {
    const { tts, practice } = progressState;
    const { weights } = progressState;

    // If one mode has no progress yet, adjust weights
    if (tts === 0 && practice > 0) {
        return practice; // Only practice matters
    } else if (practice === 0 && tts > 0) {
        return tts; // Only TTS matters
    }

    // Weighted average
    return (tts * weights.tts) + (practice * weights.practice);
}

/**
 * Animate progress change smoothly
 */
function animateProgressChange(progressBar, targetValue) {
    if (progressState.animationFrame) {
        cancelAnimationFrame(progressState.animationFrame);
    }

    const startValue = parseFloat(progressBar.style.width) || 0;
    const startTime = performance.now();
    const duration = 300; // ms

    const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out cubic)
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (targetValue - startValue) * easeProgress;

        progressBar.style.width = `${currentValue}%`;

        if (progress < 1) {
            progressState.animationFrame = requestAnimationFrame(animate);
        } else {
            progressBar.style.width = `${targetValue}%`;
            progressState.AnimationFrame = null;
        }
    };

    progressState.animationFrame = requestAnimationFrame(animate);
}

/**
 * Update progress bar color based on value
 * @param {HTMLElement} progressBar - Progress bar element
 * @param {number} value - Progress value
 */
function updateProgressBarColor(progressBar, value) {
    // Remove existing color classes
    progressBar.classList.remove(
        'bg-primary', 'bg-success', 'bg-info', 
        'bg-warning', 'bg-danger'
    );

    // Add appropriate color class
    if (value >= 90) {
        progressBar.classList.add('bg-success');
    } else if (value >= 70) {
        progressBar.classList.add('bg-info');
    } else if (value >= 40) {
        progressBar.classList.add('bg-warning');
    } else if (value >= 20) {
        progressBar.classList.add('bg-primary');
    } else {
        progressBar.classList.add('bg-danger');
    }
}

/**
 * Update progress labels with detailed information
 */
function updateProgressLabels(container, overallValue) {
    // Create or get labels container
    let labelsContainer = container.querySelector('.progress-labels');
    if (!labelsContainer) {
        labelsContainer = document.createElement('div');
        labelsContainer.className = 'progress-labels';
        container.insertBefore(labelsContainer, container.firstChild);
    }

    labelsContainer.innerHTML = `
        <span class="progress-mode-label">
            ${progressState.mode === 'tts' ? '📖 Reading' : '🎤 Practice'}
        </span>
        <span class="progress-percentage">${Math.round(overallValue)}%</span>
    `;

    // Create or get details container
    let detailsContainer = container.querySelector('.progress-details');
    if (!detailsContainer) {
        detailsContainer = document.createElement('div');
        detailsContainer.className = 'progress-details';
        container.appendChild(detailsContainer);
    }

    detailsContainer.innerHTML = `
        <div class="progress-detail-item">
            <span class="detail-dot tts"></span>
            <span>Reading: ${Math.round(progressState.ttsProgress)}%</span>
        </div>
        <div class="progress-detail-item">
            <span class="detail-dot practice"></span>
            <span>Practice: ${Math.round(progressState.practiceProgress)}%</span>
        </div>
    `;
}

/**
 * Reset progress bar to zero
 * @param {Object} options - Reset options
 */
export function resetProgress(options = {}) {
    const {
        resetTTS = true,
        resetPractice = true,
        animate = true
    } = options;

    const oldState = { ...progressState };

    progressState = {
        ...progressState,
        ttsProgress: resetTTS ? 0 : progressState.ttsProgress,
        practiceProgress: resetPractice ? 0 : progressState.practiceProgress,
        overallProgress: 0,
        lastUpdated: Date.now()
    };

    // Recalculate if only one was reset
    if ((resetTTS && !resetPractice) || (!resetTTS && resetPractice)) {
        progressState.overallProgress = calculateOverallProgress();
    }

    updateProgressBar('tts', progressState.ttsProgress, { animate, force: true });

    // Dispatch reset event
    document.dispatchEvent(new CustomEvent('progress-reset', {
        detail: { oldState, newState: progressState }
    }));
}

/**
 * Initialize progress tracking
 * @param {Object} options - Configuration options
 */
export function initProgressTracking(options = {}) {
    const {
        weights = { tts: 0.3, practice: 0.7 },
        autoInitUI = true,
        elementId = 'readingProgressBar',
        containerId = 'readingProgressContainer'
    } = options;

    // Update weights if provided
    if (weights) {
        progressState.weights = { ...progressState.weights, ...weights };
    }

    // Create container if it doesn't exist and auto-init is enabled
    if (autoInitUI) {
        createProgressContainer(elementId, containerId);
    }

    // Remove existing listeners
    eventListeners.forEach(({ event, handler }) => {
        document.removeEventListener(event, handler);
    });
    eventListeners = [];

    // Listen for TTS progress events
    const ttsHandler = (event) => {
        updateProgressBar('tts', event.detail.progress, { source: 'tts' });
    };
    document.addEventListener('tts-progress', ttsHandler);
    eventListeners.push({ event: 'tts-progress', handler: ttsHandler });

    // Listen for practice progress events
    const practiceHandler = (event) => {
        updateProgressBar('practice', event.detail.progress, { source: 'practice' });
    };
    document.addEventListener('practice-progress', practiceHandler);
    eventListeners.push({ event: 'practice-progress', handler: practiceHandler });

    // Listen for lesson complete
    const completeHandler = () => {
        updateProgressBar('practice', 100, { source: 'complete' });
    };
    document.addEventListener('lesson-complete', completeHandler);
    eventListeners.push({ event: 'lesson-complete', handler: completeHandler });

    console.log('Progress tracking initialized with weights:', progressState.weights);
}

/**
 * Create progress container if it doesn't exist
 */
function createProgressContainer(barId, containerId) {
    let container = document.getElementById(containerId);
    
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'progress-container';
        
        // Find insertion point
        const lessonContent = document.querySelector('.lesson-content');
        if (lessonContent) {
            lessonContent.insertBefore(container, lessonContent.firstChild);
        } else {
            document.body.appendChild(container);
        }
    }

    // Create progress track if bar doesn't exist
    let progressBar = document.getElementById(barId);
    if (!progressBar) {
        const track = document.createElement('div');
        track.className = 'progress-track';
        
        progressBar = document.createElement('div');
        progressBar.id = barId;
        progressBar.className = 'progress-bar progress-bar-striped';
        progressBar.setAttribute('role', 'progressbar');
        progressBar.setAttribute('aria-valuemin', '0');
        progressBar.setAttribute('aria-valuemax', '100');
        progressBar.setAttribute('aria-valuenow', '0');
        
        track.appendChild(progressBar);
        container.appendChild(track);
    }
}

/**
 * Get current progress state
 * @returns {Object} Current progress values
 */
export function getProgressState() {
    return { ...progressState };
}

/**
 * Set custom weights for progress calculation
 * @param {Object} weights - Weight object { tts: number, practice: number }
 */
export function setProgressWeights(weights) {
    if (weights.tts !== undefined) {
        progressState.weights.tts = Math.min(1, Math.max(0, weights.tts));
    }
    if (weights.practice !== undefined) {
        progressState.weights.practice = Math.min(1, Math.max(0, weights.practice));
    }
    
    // Normalize if sum > 1
    const sum = progressState.weights.tts + progressState.weights.practice;
    if (sum > 1) {
        progressState.weights.tts /= sum;
        progressState.weights.practice /= sum;
    }
    
    // Recalculate progress
    progressState.overallProgress = calculateOverallProgress();
    updateProgressBar('combined', progressState.overallProgress, { animate: true, force: true });
}

export default {
    updateProgressBar,
    resetProgress,
    initProgressTracking,
    getProgressState,
    setProgressWeights
};