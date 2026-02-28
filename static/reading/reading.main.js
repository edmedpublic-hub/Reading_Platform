// project/static/reading/reading.main.js

import { populateVoices, initTextReader, synth } from "./reading.text.js";
import { initListening } from "./reading.listen.js";
import { initFeedback } from "./reading.feedback.js";
import { initRecognition } from "./reading.recognition.js";

// DOM references
const titleEl = document.getElementById("lessonTitle");
const textEl = document.getElementById("lessonText");
const readingApp = document.getElementById("reading-app");

// App state
const AppState = {
    currentLesson: null,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
};

// Show loading state
function showLoading() {
    if (!textEl) return;
    textEl.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="text-muted mt-2">Loading lesson...</p>
        </div>
    `;
}

// Show error state
function showError(message) {
    if (!textEl) return;
    textEl.innerHTML = `
        <div class="alert alert-danger m-3" role="alert">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            ${message}
        </div>
    `;
}

// Load lesson from API
// Load lesson from API
async function loadLesson(id) {
    if (!id) {
        console.error("No lesson ID provided");
        showError("No lesson ID found");
        return;
    }
    
    console.log("Loading lesson ID:", id);
    showLoading();
    
    // Try multiple possible URL patterns
    const urls = [
        `/reading/api/lessons/${id}/`,
        `/api/reading/lessons/${id}/`,
        `/reading/lessons/${id}/`,
        `/api/lessons/${id}/`
    ];
    
    let lastError = null;
    
    for (const url of urls) {
        try {
            console.log("Trying URL:", url);
            const res = await fetch(url);
            
            if (res.ok) {
                console.log("Success with URL:", url);
                const lesson = await res.json();
                
                // Update page title
                document.title = `${lesson.title} | Reading Platform`;
                if (titleEl) titleEl.textContent = lesson.title;
                
                const raw = lesson.content || "";
                
                // Format paragraphs
                const paragraphs = raw
                    .split("\n")
                    .filter(p => p.trim() !== "")
                    .map(p => `<p class="mb-3">${p}</p>`)
                    .join("");
                
                if (textEl) {
                    textEl.innerHTML = paragraphs || '<p class="text-muted">No content available.</p>';
                }
                
                // Split into sentences for TTS
                const sentences = raw
                    .replace(/\n+/g, " ")
                    .split(/(?<=[.!?])\s+/)
                    .filter(s => s.trim() !== "");
                
                // Store lesson data globally
                window.originalSentences = sentences;
                window.displayedSentences = [...sentences];
                window.lessonText = raw;
                window.currentLesson = {
                    id: id,
                    title: lesson.title,
                    content: raw,
                    sentences: sentences
                };
                
                console.log("Lesson loaded. Sentences:", sentences.length);
                return; // Success, exit function
            }
        } catch (err) {
            console.log(`URL ${url} failed:`, err.message);
            lastError = err;
        }
    }
    
    // If we get here, all URLs failed
    console.error("All URLs failed");
    showError("Failed to load lesson. Please check your connection.");
}
// Initialize everything
async function initApp() {
    console.log("Initializing Reading App...");
    
    // Load lesson if on detail page
    const lessonId = readingApp?.dataset.lessonId;
    
    if (lessonId) {
        await loadLesson(lessonId);
    }
    
    // Initialize speech synthesis voices
    setTimeout(() => {
        populateVoices();
        if (synth) {
            synth.onvoiceschanged = populateVoices;
        }
    }, 100);
    
    // Initialize all modules
    initRecognition();
    initTextReader();
    initListening();
    initFeedback();
    
    console.log("App initialization complete");
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

export { AppState };