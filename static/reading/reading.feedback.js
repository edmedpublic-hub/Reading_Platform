// project/static/reading/reading.feedback.js

import { renderHighlighted, getCurrentIndex } from "./reading.text.js";

let getFeedbackBtn;
let feedbackBox;
let feedbackLoading;
let csrftoken;

// Get CSRF token
function getCookie(name) {
    const cookieValue = document.cookie
        .split("; ")
        .find((row) => row.startsWith(name + "="));
    return cookieValue ? decodeURIComponent(cookieValue.split("=")[1]) : null;
}

// Pronunciation tips database
function getPronunciationTip(word) {
    const tips = {
        'the': 'Tongue between teeth',
        'and': 'Short a sound',
        'but': 'Short u sound',
        'for': 'Say "f-or"',
        'through': 'Say "th-rew"',
        'thought': 'Th + aw + t',
        'could': 'Silent l',
        'would': 'Silent l',
        'should': 'Silent l',
        'people': 'Pee + pull',
        'because': 'Be + cause',
        'different': 'Diff + rent',
        'important': 'Im + por + tant',
        'beautiful': 'Byoo + ti + ful',
        'this': 'Th + is',
        'that': 'Th + at',
        'these': 'Th + eez',
        'those': 'Th + ohz',
        'know': 'Silent k',
        'write': 'Silent w',
        'right': 'Rite',
        'light': 'Lite',
        'night': 'Nite',
        'said': 'Sed',
        'have': 'Like "hat"',
        'were': 'Like "her"',
        'where': 'Wh + air',
        'there': 'Th + air',
    };
    return tips[word.toLowerCase()] || 'Practice slowly';
}

// Format feedback HTML
function formatFeedbackHTML(data) {
    const score = data.score || 0;
    const feedback = data.feedback || "No feedback available.";
    const mispronouncedWords = Array.isArray(data.mispronounced) ? data.mispronounced : [];
    
    let html = `
        <div class="feedback-container">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <span class="fw-bold">Score:</span>
                <span class="badge ${getScoreBadgeClass(score)} rounded-pill fs-6 px-3 py-2">${score}%</span>
            </div>
            <div class="alert alert-info py-2 small mb-3">${feedback}</div>
    `;
    
    if (mispronouncedWords.length > 0) {
        html += '<div class="small"><span class="fw-bold">Practice these words:</span><ul class="list-unstyled mt-2">';
        mispronouncedWords.slice(0, 5).forEach(item => {
            const tip = getPronunciationTip(item.word);
            html += `
                <li class="mb-2 pb-1 border-bottom">
                    <span class="fw-bold">${item.word}</span>
                    <span class="text-muted ms-2">→ ${item.heard || '?'}</span>
                    <br><small class="text-primary"><i class="bi bi-lightbulb me-1"></i>${tip}</small>
                </li>
            `;
        });
        if (mispronouncedWords.length > 5) {
            html += `<li class="text-muted small">+${mispronouncedWords.length - 5} more words</li>`;
        }
        html += '</ul></div>';
    } else {
        html += '<div class="alert alert-success py-2 small">Perfect! No errors detected. 🌟</div>';
    }
    
    html += '</div>';
    return html;
}

function getScoreBadgeClass(score) {
    if (score >= 90) return 'bg-success';
    if (score >= 75) return 'bg-primary';
    if (score >= 60) return 'bg-info';
    if (score >= 40) return 'bg-warning text-dark';
    return 'bg-danger';
}

// Highlight problem words in text
function highlightProblemWords(mispronouncedWords) {
    if (!mispronouncedWords || !mispronouncedWords.length || !window.originalSentences) {
        if (window.displayedSentences && window.originalSentences) {
            window.displayedSentences = [...window.originalSentences];
            renderHighlighted(getCurrentIndex());
        }
        return;
    }
    
    const wordsToFlag = new Set(mispronouncedWords.map(m => m.word.toLowerCase()));
    
    window.displayedSentences = window.originalSentences.map(sentence =>
        sentence.split(/\b/).map(token => {
            const clean = token.replace(/[^\w']/g, "").toLowerCase();
            if (wordsToFlag.has(clean)) {
                return `<span class="mispronounced" title="Practice this word">${token}</span>`;
            }
            return token;
        }).join("")
    );
    
    renderHighlighted(getCurrentIndex());
}

// Main analysis function
async function analyzeReading() {
    const transcript = (window.transcriptAcc || window.lastTranscript || "").trim();
    
    if (!transcript) {
        if (feedbackBox) {
            feedbackBox.innerHTML = '<p class="text-warning mb-0">No speech recorded. Please read first.</p>';
        }
        return;
    }
    
    // Show loading
    if (feedbackLoading) feedbackLoading.classList.remove('d-none');
    if (feedbackBox) {
        feedbackBox.innerHTML = '<p class="text-muted mb-0">Analyzing...</p>';
    }
    
    const payload = {
        expected: window.lessonText || "",
        spoken: transcript,
    };
    
    const lessonSection = document.querySelector("[data-lesson-id]");
    if (lessonSection?.dataset.lessonId) {
        payload.lesson_id = lessonSection.dataset.lessonId;
    }
    
    // CORRECT URL based on your urls.py
    const url = "/reading/api/feedback/";
    
    try {
        console.log("Sending feedback request to:", url);
        console.log("Payload:", payload);
        
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
            },
            body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server response:", response.status, errorText);
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Feedback data received:", data);
        
        // Display feedback
        if (feedbackBox) {
            feedbackBox.innerHTML = formatFeedbackHTML(data);
        }
        
        // Highlight problem words
        highlightProblemWords(data.mispronounced);
        
        // Clear transcript for next attempt
        setTimeout(() => {
            window.transcriptAcc = "";
            window.lastTranscript = "";
        }, 1000);
        
    } catch (err) {
        console.error("Feedback error:", err);
        if (feedbackBox) {
            feedbackBox.innerHTML = `<p class="text-danger mb-0">Error getting feedback: ${err.message}</p>`;
        }
    } finally {
        if (feedbackLoading) feedbackLoading.classList.add('d-none');
    }
}

// Initialize
export function initFeedback() {
    getFeedbackBtn = document.getElementById("get-feedback-btn");
    feedbackBox = document.getElementById("feedbackBox");
    feedbackLoading = document.getElementById("feedback-loading");
    csrftoken = getCookie("csrftoken");
    
    if (!getFeedbackBtn || !feedbackBox) {
        console.warn("Feedback elements not found");
        return;
    }
    
    // Listen for auto-analysis
    document.addEventListener('recording-complete', () => {
        setTimeout(analyzeReading, 500);
    });
    
    // Manual click
    getFeedbackBtn.addEventListener("click", analyzeReading);
    
    console.log("Feedback module initialized");
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    .mispronounced {
        background-color: #fff3cd;
        border-bottom: 2px solid #ffc107;
        padding: 2px 0;
        cursor: help;
    }
    .mispronounced:hover {
        background-color: #ffe69c;
    }
`;
document.head.appendChild(style);