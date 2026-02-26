// project/static/reading/reading.listen.js
import { recognition, initRecognition } from "./reading.recognition.js";

let startRecordBtn;
let stopRecordBtn;

export let recording = false;

export function initListening() {
  startRecordBtn = document.getElementById("start-record-btn");
  stopRecordBtn = document.getElementById("stop-record-btn");

  if (!startRecordBtn || !stopRecordBtn) {
    console.warn("Recording buttons not found in DOM.");
    return;
  }

  // START RECORDING
  startRecordBtn.addEventListener("click", () => {
    window.transcriptAcc = ""; // reset transcript
    recording = true;

    if (!recognition) {
      initRecognition();
    }

    try {
      recognition.start();
      startRecordBtn.disabled = true;
      stopRecordBtn.disabled = false;
      console.log("Recognition started…");
    } catch (err) {
      console.error("Could not start recognition:", err);
    }
  });

  // STOP RECORDING
  stopRecordBtn.addEventListener("click", () => {
    if (recognition && recording) {
      try {
        recognition.stop();
        console.log("Recognition stopped.");
      } catch (err) {
        console.error("Error stopping recognition:", err);
      }
    }

    recording = false;
    startRecordBtn.disabled = false;
    stopRecordBtn.disabled = true;
  });
}
