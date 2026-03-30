// static/reading/speech-recognition/components/microphone.js
// PURPOSE: Handle microphone permissions, audio stream, and level monitoring

let permissionGranted = false;
let streamActive = false;

let audioContext = null;
let analyser = null;
let microphoneNode = null;
let mediaStream = null;

let visualizationFrame = null;
let levelMonitorInterval = null;
let resizeHandler = null;

let onPermissionChangeCallback = null;
let onAudioLevelCallback = null;

const LEVEL_MONITOR_INTERVAL = 100;
const SMOOTHING_FACTOR = 0.2;

/* ======================================================
    PERMISSION CHECK
====================================================== */

export async function checkExistingPermission() {
    if (!navigator.permissions || !navigator.permissions.query) {
        return false;
    }

    try {
        const permission = await navigator.permissions.query({
            name: 'microphone'
        });
        return permission.state === 'granted';
    } catch {
        return false;
    }
}

/* ======================================================
    REQUEST MICROPHONE
====================================================== */

export async function requestMicrophone(options = {}) {
    const {
        enableVisualizer = false,
        visualizerEl = null,
        enableLevelMonitoring = false,
        onAudioLevel = null
    } = options;

    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('media-devices-not-supported');
    }

    // Fix: Using official browser check instead of manual hostname string matching
    if (!window.isSecureContext) {
        throw new Error('secure-context-required');
    }

    if (streamActive) {
        return mediaStream;
    }

    // Ensure previous instances are killed before starting new ones
    await stopMicrophone();

    try {
        console.log('🎤 Requesting microphone permission...');

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        mediaStream = stream;
        permissionGranted = true;
        streamActive = true;

        if (enableVisualizer || enableLevelMonitoring) {
            setupAudioProcessing(stream, {
                enableVisualizer,
                visualizerEl,
                enableLevelMonitoring,
                onAudioLevel
            });
        }

        triggerPermissionChange(true);
        console.log('✅ Microphone ready');
        return stream;

    } catch (error) {
        permissionGranted = false;
        streamActive = false;
        mediaStream = null;

        triggerPermissionChange(false);

        if (error.name === 'NotAllowedError') {
            throw new Error('permission-denied');
        }
        if (error.name === 'NotFoundError') {
            throw new Error('audio-capture');
        }
        if (error.name === 'NotReadableError') {
            throw new Error('microphone-busy');
        }
        throw new Error('microphone-error');
    }
}

/* ======================================================
    AUDIO PROCESSING
====================================================== */

function setupAudioProcessing(stream, options) {
    const {
        enableVisualizer,
        visualizerEl,
        enableLevelMonitoring,
        onAudioLevel
    } = options;

    try {
        if (!audioContext) {
            const AC = window.AudioContext || window.webkitAudioContext;
            audioContext = new AC();
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        analyser = audioContext.createAnalyser();
        microphoneNode = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        microphoneNode.connect(analyser);

        if (enableVisualizer && visualizerEl) {
            startVisualizer(visualizerEl);
        }

        if (enableLevelMonitoring && onAudioLevel) {
            onAudioLevelCallback = onAudioLevel;
            startLevelMonitoring();
        }

    } catch (error) {
        console.warn('Audio processing failed:', error);
    }
}

/* ======================================================
    VISUALIZER
====================================================== */

function startVisualizer(canvas) {
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function resize() {
        canvas.width = canvas.clientWidth || 300;
        canvas.height = canvas.clientHeight || 60;
    }

    resize();
    resizeHandler = resize;
    window.addEventListener('resize', resizeHandler);

    function draw() {
        visualizationFrame = requestAnimationFrame(draw);
        if (!analyser) return;
        
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillStyle = `hsl(${200 + barHeight},80%,60%)`;
            ctx.fillRect(
                x,
                canvas.height - barHeight,
                barWidth - 1,
                barHeight
            );
            x += barWidth;
        }
    }
    draw();
}

/* ======================================================
    LEVEL MONITOR
====================================================== */

function startLevelMonitoring() {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastLevel = 0;
    let noiseFloor = 0;

    levelMonitorInterval = setInterval(() => {
        if (!analyser) return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }

        const avg = sum / dataArray.length;
        const rawLevel = (avg / 255) * 100;

        const smoothed =
            lastLevel * SMOOTHING_FACTOR +
            rawLevel * (1 - SMOOTHING_FACTOR);

        lastLevel = smoothed;
        noiseFloor = noiseFloor * 0.95 + rawLevel * 0.05;
        const isSpeaking = smoothed > noiseFloor + 3;

        onAudioLevelCallback?.({
            level: Math.round(smoothed),
            raw: Math.round(rawLevel),
            isSpeaking,
            timestamp: Date.now()
        });
    }, LEVEL_MONITOR_INTERVAL);
}

/* ======================================================
    STOP MICROPHONE
====================================================== */

export async function stopMicrophone() {
    console.log("🛑 Hardware: Shutting down microphone...");

    if (visualizationFrame) {
        cancelAnimationFrame(visualizationFrame);
        visualizationFrame = null;
    }

    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }

    if (levelMonitorInterval) {
        clearInterval(levelMonitorInterval);
        levelMonitorInterval = null;
    }

    // Disconnect audio nodes to stop processing
    microphoneNode?.disconnect();
    microphoneNode = null;
    analyser = null;

    // Suspend audio context to tell browser we are done with the hardware
    if (audioContext && audioContext.state !== 'closed') {
        try {
            await audioContext.suspend();
        } catch (e) {
            console.warn("AudioContext suspend failed", e);
        }
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
            track.stop();
            console.log(`🚫 Track ${track.label} stopped`);
        });
        mediaStream = null;
    }

    streamActive = false;
    console.log("✅ Hardware: Microphone released");
}

/* ======================================================
    STREAM CONTROL
====================================================== */

export function pauseMicrophone() {
    mediaStream?.getTracks().forEach(track => track.enabled = false);
}

export function resumeMicrophone() {
    mediaStream?.getTracks().forEach(track => track.enabled = true);
}

/* ======================================================
    STATE GETTERS
====================================================== */

export function hasMicrophonePermission() {
    return permissionGranted;
}

export function getMediaStream() {
    return mediaStream;
}

export function getCurrentAudioLevel() {
    if (!analyser) return 0;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    return Math.round((avg / 255) * 100);
}

/* ======================================================
    PERMISSION EVENTS
====================================================== */

export function onPermissionChange(callback) {
    onPermissionChangeCallback = callback;
}

function triggerPermissionChange(granted) {
    onPermissionChangeCallback?.(granted);

    document.dispatchEvent(new CustomEvent(
        'microphone-permission-changed',
        { detail: { granted, timestamp: Date.now() } }
    ));
}

/* ======================================================
    PUBLIC API
====================================================== */

export default {
    requestMicrophone,
    stopMicrophone,
    pauseMicrophone,
    resumeMicrophone,
    hasMicrophonePermission,
    getMediaStream,
    getCurrentAudioLevel,
    onPermissionChange,
    checkExistingPermission
};