// project/static/reading/reading.recognition.js

export const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

export let recognition = null;

// Shared transcript accumulator
window.transcriptAcc = window.transcriptAcc || "";
window.lastTranscript = window.lastTranscript || "";

// Track recording state
let isListening = false;
let restartTimeout = null;

export function initRecognition() {
  if (!SpeechRecognition) {
    console.warn("Speech Recognition is not supported in this browser.");
    const recordBtn = document.getElementById('start-record-btn');
    if (recordBtn) {
      recordBtn.disabled = true;
      recordBtn.title = "Speech recognition not supported. Try Chrome.";
      recordBtn.innerHTML = '❌ Not Supported';
    }
    return null;
  }

  try {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;
    recognition.onstart = handleStart;

    console.log("Speech recognition initialized");
    
    // Setup default voice button
    initDefaultVoiceButton();
    
    return recognition;
    
  } catch (err) {
    console.error("Failed to initialize:", err);
    return null;
  }
}

// Default Voice button handler
function initDefaultVoiceButton() {
  const defaultVoiceBtn = document.getElementById('default-voice-btn');
  if (defaultVoiceBtn) {
    defaultVoiceBtn.addEventListener('click', () => {
      const voiceSelect = document.getElementById('voiceSelect');
      if (voiceSelect && voiceSelect.options.length > 0) {
        voiceSelect.selectedIndex = 0;
        voiceSelect.dispatchEvent(new Event('change'));
      }
    });
  }
}

function handleResult(event) {
  let finalTranscript = '';

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;
    
    if (event.results[i].isFinal) {
      finalTranscript += transcript + ' ';
      window.transcriptAcc = (window.transcriptAcc || "") + " " + transcript;
      window.lastTranscript = window.transcriptAcc;
    }
  }

  if (finalTranscript) {
    console.log("Transcript:", finalTranscript.trim());
  }
}

function handleError(event) {
  console.error("Recognition error:", event.error);
  
  let userMessage = "Error: ";
  switch(event.error) {
    case 'no-speech': userMessage = "No speech detected."; break;
    case 'not-allowed': userMessage = "Microphone access denied."; break;
    default: userMessage = `Error: ${event.error}`;
  }
  
  document.dispatchEvent(new CustomEvent('recognition-error', { 
    detail: { message: userMessage }
  }));
  
  stopRecording();
}

function handleEnd() {
  console.log("Recognition ended");
  
  if (!isListening) {
    const finalTranscript = window.transcriptAcc?.trim() || "";
    if (finalTranscript) {
      document.dispatchEvent(new CustomEvent('recording-complete', { 
        detail: { transcript: finalTranscript }
      }));
    }
  }
  
  updateRecordingUI(false);
  isListening = false;
}

function handleStart() {
  console.log("Recognition started");
  isListening = true;
  updateRecordingUI(true);
}

function updateRecordingUI(isActive) {
  const startBtn = document.getElementById('start-record-btn');
  const stopBtn = document.getElementById('stop-record-btn');
  const recordingStatus = document.getElementById('recording-status');
  
  if (startBtn) {
    startBtn.disabled = isActive;
    startBtn.innerHTML = isActive ? '🔴 Recording...' : '🎙 Start';
  }
  
  if (stopBtn) {
    stopBtn.disabled = !isActive;
  }
  
  if (recordingStatus) {
    if (isActive) {
      recordingStatus.classList.remove('d-none');
    } else {
      recordingStatus.classList.add('d-none');
    }
  }
}

export function startRecording() {
  if (!recognition) {
    recognition = initRecognition();
    if (!recognition) return false;
  }
  
  try {
    window.transcriptAcc = "";
    window.lastTranscript = "";
    recognition.start();
    return true;
  } catch (err) {
    console.error("Start failed:", err);
    return false;
  }
}

export function stopRecording() {
  if (!recognition) return false;
  
  try {
    isListening = false;
    recognition.stop();
    return true;
  } catch (err) {
    console.error("Stop failed:", err);
    return false;
  }
}

export function getTranscript() {
  return window.transcriptAcc?.trim() || "";
}

export function clearTranscript() {
  window.transcriptAcc = "";
  window.lastTranscript = "";
}

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
  console.log("Recognition module ready");
});