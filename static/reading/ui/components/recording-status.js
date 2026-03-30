// static/reading/ui/components/recording-status.js
// PURPOSE: Show visual feedback for recording/recognition states

// Ensure styles are loaded
function ensureRecordingStyles() {
    if (document.getElementById('recording-status-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'recording-status-styles';
    style.textContent = `
        .recording-indicator {
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.5rem 1rem;
            border-radius: 999px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            font-size: 0.875rem;
            transition: all 0.3s ease;
        }
        
        .recording-indicator.active {
            background: #fff3cd;
            border-color: #ffc107;
            color: #856404;
        }
        
        .recording-indicator.processing {
            background: #e7f3ff;
            border-color: #007bff;
            color: #004085;
        }
        
        .recording-indicator.ready {
            background: #d4edda;
            border-color: #28a745;
            color: #155724;
        }
        
        .recording-indicator.error {
            background: #f8d7da;
            border-color: #dc3545;
            color: #721c24;
        }
        
        .recording-indicator.muted {
            background: #e9ecef;
            border-color: #6c757d;
            color: #495057;
            opacity: 0.7;
        }
        
        .recording-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #6c757d;
            transition: all 0.3s ease;
        }
        
        .active .recording-dot {
            background: #dc3545;
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        .processing .recording-dot {
            background: #007bff;
            animation: spin 1s linear infinite;
            border-radius: 2px;
        }
        
        .ready .recording-dot {
            background: #28a745;
        }
        
        .error .recording-dot {
            background: #dc3545;
        }
        
        .muted .recording-dot {
            background: #6c757d;
        }
        
        @keyframes pulse {
            0%, 100% {
                transform: scale(1);
                opacity: 1;
            }
            50% {
                transform: scale(1.2);
                opacity: 0.7;
            }
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(90deg); }
            50% { transform: rotate(180deg); }
            75% { transform: rotate(270deg); }
            100% { transform: rotate(360deg); }
        }
        
        .recording-timer {
            font-family: monospace;
            font-size: 0.875rem;
            padding: 0.125rem 0.5rem;
            background: rgba(0,0,0,0.05);
            border-radius: 4px;
        }
        
        .audio-level {
            width: 60px;
            height: 20px;
            background: rgba(0,0,0,0.1);
            border-radius: 10px;
            overflow: hidden;
            margin-left: 0.5rem;
        }
        
        .audio-level-fill {
            height: 100%;
            width: 0%;
            background: #28a745;
            transition: width 0.1s ease;
        }
        
        .audio-level-fill.low { background: #28a745; }
        .audio-level-fill.medium { background: #ffc107; }
        .audio-level-fill.high { background: #dc3545; }
        
        .recording-actions {
            display: inline-flex;
            gap: 0.25rem;
            margin-left: 0.5rem;
        }
        
        .recording-actions button {
            background: none;
            border: none;
            padding: 0.25rem;
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.2s;
        }
        
        .recording-actions button:hover {
            opacity: 1;
        }
        
        .d-none {
            display: none !important;
        }
        
        /* RTL Support */
        [dir="rtl"] .recording-indicator {
            flex-direction: row-reverse;
        }
        
        [dir="rtl"] .audio-level {
            margin-left: 0;
            margin-right: 0.5rem;
        }
        
        [dir="rtl"] .recording-actions {
            margin-left: 0;
            margin-right: 0.5rem;
        }
    `;
    document.head.appendChild(style);
}

// Recording state
let recordingState = {
    status: 'inactive', // 'inactive', 'recording', 'processing', 'ready', 'error', 'muted'
    startTime: null,
    timerInterval: null,
    audioLevel: 0,
    duration: 0
};

// Status messages for different states
const statusMessages = {
    recording: {
        en: 'Recording... Speak now',
        ar: 'جاري التسجيل... تحدث الآن'
    },
    processing: {
        en: 'Processing...',
        ar: 'جاري المعالجة...'
    },
    ready: {
        en: 'Ready to speak',
        ar: 'جاهز للتحدث'
    },
    error: {
        en: 'Microphone error',
        ar: 'خطأ في الميكروفون'
    },
    muted: {
        en: 'Microphone is muted',
        ar: 'الميكروفون مكتوم'
    },
    inactive: {
        en: 'Click microphone to start',
        ar: 'انقر على الميكروفون للبدء'
    }
};

/**
 * Update recording status indicator
 * @param {string|boolean} status - 'recording', 'processing', 'ready', 'error', 'muted', 'inactive' or boolean for legacy support
 * @param {Object} options - Additional options
 * @param {string} options.statusId - Status element ID
 * @param {number} options.audioLevel - Current audio level (0-100)
 * @param {string} options.language - 'en' or 'ar'
 * @param {boolean} options.showTimer - Show recording duration
 * @param {boolean} options.showActions - Show action buttons
 * @param {Function} options.onStop - Callback for stop button
 * @param {Function} options.onCancel - Callback for cancel button
 */
export function updateRecordingStatus(status, options = {}) {
    const {
        statusId = 'recording-status',
        audioLevel = 0,
        language = 'en',
        showTimer = true,
        showActions = false,
        onStop = null,
        onCancel = null
    } = options;

    const statusEl = document.getElementById(statusId);
    if (!statusEl) {
        // Create container if it doesn't exist
        createStatusContainer(statusId);
        return;
    }

    // Ensure styles exist
    ensureRecordingStyles();

    // Check for RTL
    if (language === 'ar') {
        statusEl.setAttribute('dir', 'rtl');
    }

    // Handle legacy boolean parameter
    if (typeof status === 'boolean') {
        status = status ? 'recording' : 'inactive';
    }

    // Update state
    const previousState = { ...recordingState };
    recordingState.status = status;
    recordingState.audioLevel = audioLevel;

    // Handle timer
    if (status === 'recording' && !recordingState.startTime) {
        // Start recording
        recordingState.startTime = Date.now();
        recordingState.duration = 0;
        startTimer(statusEl);
    } else if (status !== 'recording' && previousState.status === 'recording') {
        // Stop recording
        stopTimer();
        recordingState.startTime = null;
    }

    // Build status HTML
    const message = getStatusMessage(status, language);
    const showElement = status !== 'inactive';

    statusEl.innerHTML = buildStatusHTML(status, message, {
        audioLevel,
        showTimer: showTimer && status === 'recording',
        showActions,
        duration: recordingState.duration,
        onStop,
        onCancel
    });

    // Update visibility
    if (showElement) {
        statusEl.classList.remove('d-none');
    } else {
        statusEl.classList.add('d-none');
    }

    // Dispatch event
    document.dispatchEvent(new CustomEvent('recording-status-changed', {
        detail: { 
            status, 
            previous: previousState.status,
            audioLevel,
            duration: recordingState.duration,
            timestamp: Date.now()
        }
    }));
}

/**
 * Create status container if it doesn't exist
 */
function createStatusContainer(statusId) {
    let container = document.getElementById(statusId);
    if (container) return;

    container = document.createElement('div');
    container.id = statusId;
    container.className = 'recording-status-container';
    
    // Find appropriate insertion point
    const controls = document.querySelector('.recording-controls') || 
                     document.querySelector('.lesson-controls') ||
                     document.body;
    
    controls.appendChild(container);
}

/**
 * Build status HTML
 */
function buildStatusHTML(status, message, options) {
    const {
        audioLevel = 0,
        showTimer = false,
        showActions = false,
        duration = 0,
        onStop,
        onCancel
    } = options;

    const audioLevelClass = 
        audioLevel < 30 ? 'low' :
        audioLevel < 70 ? 'medium' : 'high';

    const timerHtml = showTimer ? 
        `<span class="recording-timer">${formatDuration(duration)}</span>` : '';

    const audioLevelHtml = audioLevel > 0 ?
        `<div class="audio-level">
            <div class="audio-level-fill ${audioLevelClass}" style="width: ${audioLevel}%"></div>
        </div>` : '';

    const actionsHtml = showActions ? 
        `<span class="recording-actions">
            ${onStop ? `<button class="stop-recording" onclick="(${onStop.toString()})()" title="Stop">⏹️</button>` : ''}
            ${onCancel ? `<button class="cancel-recording" onclick="(${onCancel.toString()})()" title="Cancel">❌</button>` : ''}
        </span>` : '';

    return `
        <span class="recording-indicator ${status}" role="status" aria-live="polite">
            <span class="recording-dot"></span>
            <span class="recording-message">${message}</span>
            ${timerHtml}
            ${audioLevelHtml}
            ${actionsHtml}
        </span>
    `;
}

/**
 * Get status message in appropriate language
 */
function getStatusMessage(status, language) {
    const messages = statusMessages[status] || statusMessages.inactive;
    return messages[language] || messages.en;
}

/**
 * Format duration as MM:SS
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Start recording timer
 */
function startTimer(statusEl) {
    stopTimer(); // Clear any existing timer

    recordingState.timerInterval = setInterval(() => {
        if (recordingState.startTime) {
            recordingState.duration = Math.floor((Date.now() - recordingState.startTime) / 1000);
            
            // Update timer display if it exists
            const timerEl = statusEl.querySelector('.recording-timer');
            if (timerEl) {
                timerEl.textContent = formatDuration(recordingState.duration);
            }

            // Dispatch duration update event
            document.dispatchEvent(new CustomEvent('recording-duration-updated', {
                detail: { duration: recordingState.duration }
            }));
        }
    }, 1000);
}

/**
 * Stop recording timer
 */
function stopTimer() {
    if (recordingState.timerInterval) {
        clearInterval(recordingState.timerInterval);
        recordingState.timerInterval = null;
    }
}

/**
 * Update audio level
 * @param {number} level - Audio level (0-100)
 * @param {string} statusId - Status element ID
 */
export function updateAudioLevel(level, statusId = 'recording-status') {
    const statusEl = document.getElementById(statusId);
    if (!statusEl) return;

    const levelFill = statusEl.querySelector('.audio-level-fill');
    if (levelFill) {
        levelFill.style.width = `${level}%`;
        
        // Update color class
        levelFill.classList.remove('low', 'medium', 'high');
        if (level < 30) levelFill.classList.add('low');
        else if (level < 70) levelFill.classList.add('medium');
        else levelFill.classList.add('high');
    }

    recordingState.audioLevel = level;
}

/**
 * Reset recording status
 * @param {string} statusId - Status element ID
 */
export function resetRecordingStatus(statusId = 'recording-status') {
    stopTimer();
    recordingState = {
        status: 'inactive',
        startTime: null,
        timerInterval: null,
        audioLevel: 0,
        duration: 0
    };
    
    const statusEl = document.getElementById(statusId);
    if (statusEl) {
        statusEl.innerHTML = '';
        statusEl.classList.add('d-none');
    }
}

/**
 * Get current recording state
 */
export function getRecordingState() {
    return { ...recordingState };
}

export default {
    updateRecordingStatus,
    updateAudioLevel,
    resetRecordingStatus,
    getRecordingState
};