// project/static/reading/reading.listen.js

import { 
  recognition, 
  initRecognition, 
  startRecording, 
  stopRecording, 
  getTranscript, 
  clearTranscript 
} from "./reading.recognition.js";

let startRecordBtn;
let stopRecordBtn;
let recordingStatus;
let feedbackBox;
let feedbackBtn;

export let recording = false;
let isProcessing = false;

export function initListening() {
  // Get DOM elements
  startRecordBtn = document.getElementById("start-record-btn");
  stopRecordBtn = document.getElementById("stop-record-btn");
  recordingStatus = document.getElementById("recording-status");
  feedbackBox = document.getElementById("feedbackBox");
  feedbackBtn = document.getElementById("get-feedback-btn");

  if (!startRecordBtn || !stopRecordBtn) {
    console.warn("Recording buttons not found");
    return;
  }

  // Initial button states
  startRecordBtn.disabled = false;
  stopRecordBtn.disabled = true;

  // Event listeners from recognition module
  document.addEventListener('recording-complete', handleRecordingComplete);
  document.addEventListener('recognition-error', handleRecognitionError);

  // Start recording
  startRecordBtn.addEventListener("click", handleStartClick);
  startRecordBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleStartClick(e);
  });

  // Stop recording
  stopRecordBtn.addEventListener("click", handleStopClick);
  stopRecordBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handleStopClick(e);
  });

  console.log("Listening module initialized");
}

function handleStartClick(e) {
  e.preventDefault();
  
  if (!recognition) {
    initRecognition();
  }
  
  // Clear previous data
  clearTranscript();
  
  if (feedbackBox) {
    feedbackBox.innerHTML = '<p class="text-muted mb-0">Recording... Feedback will appear after you stop.</p>';
  }
  
  const started = startRecording();
  
  if (started) {
    recording = true;
    startRecordBtn.disabled = true;
    stopRecordBtn.disabled = false;
    
    if (recordingStatus) {
      recordingStatus.classList.remove('d-none');
    }
    
    console.log("Recording started");
  }
}

function handleStopClick(e) {
  e.preventDefault();
  
  if (!recording) return;
  
  const stopped = stopRecording();
  
  if (stopped) {
    recording = false;
    startRecordBtn.disabled = false;
    stopRecordBtn.disabled = true;
    
    if (recordingStatus) {
      recordingStatus.classList.add('d-none');
    }
    
    console.log("Recording stopped");
  }
}

function handleRecordingComplete(event) {
  if (isProcessing) return;
  
  const { transcript } = event.detail;
  console.log("Recording complete, transcript:", transcript);
  
  if (!transcript || transcript.trim() === "") {
    if (feedbackBox) {
      feedbackBox.innerHTML = '<p class="text-warning mb-0">No speech detected. Please try again.</p>';
    }
    return;
  }
  
  isProcessing = true;
  
  // Store transcript
  window.transcriptAcc = transcript;
  window.lastTranscript = transcript;
  
  // Show processing
  if (feedbackBox) {
    feedbackBox.innerHTML = '<p class="text-info mb-0">Analyzing your reading...</p>';
  }
  
  // Auto-click feedback button after short delay
  if (feedbackBtn) {
    setTimeout(() => {
      feedbackBtn.click();
      // Reset processing flag after analysis
      setTimeout(() => {
        isProcessing = false;
      }, 2000);
    }, 500);
  }
}

function handleRecognitionError(event) {
  const { message } = event.detail;
  console.error("Recognition error:", message);
  
  recording = false;
  startRecordBtn.disabled = false;
  stopRecordBtn.disabled = true;
  
  if (recordingStatus) {
    recordingStatus.classList.add('d-none');
  }
  
  if (feedbackBox) {
    feedbackBox.innerHTML = `<p class="text-danger mb-0">${message}</p>`;
  }
}

// Check if recording
export function isRecording() {
  return recording;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log("Listen module loaded");
});