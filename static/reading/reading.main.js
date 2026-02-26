// project/static/reading/reading.main.js
import { populateVoices, initTextReader, synth } from "./reading.text.js";
import { initListening } from "./reading.listen.js";
import { initFeedback } from "./reading.feedback.js";

// DOM references
const titleEl = document.getElementById("lessonTitle");
const textEl = document.getElementById("lessonText");
const listContainer = document.getElementById("lesson-list");

// ---------------- LOAD LESSON ----------------
async function loadLesson(id) {
  try {
    const res = await fetch(`/reading/api/lessons/${id}/`);
    if (!res.ok) throw new Error("Lesson not found");

    const lesson = await res.json();

    if (titleEl) titleEl.textContent = lesson.title;

    const raw = lesson.content || "";

    // Render paragraphs
    const paragraphs = raw
      .split("\n")
      .filter(p => p.trim() !== "")
      .map(p => `<p>${p}</p>`)
      .join("");

    if (textEl) textEl.innerHTML = paragraphs;

    // Provide shared state for reader + feedback modules
    window.originalSentences = raw
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim() !== "");

    window.displayedSentences = [...window.originalSentences];
    window.lessonText = raw;
  } catch (err) {
    console.error("Error loading lesson:", err);
  }
}

// ---------------- LOAD LESSON LIST ----------------
async function loadLessonList() {
  if (!listContainer) return;

  try {
    const res = await fetch("/reading/api/lessons/");
    if (!res.ok) throw new Error("Could not load lessons");

    const lessons = await res.json();

    if (!Array.isArray(lessons) || lessons.length === 0) {
      listContainer.textContent = "No lessons available yet.";
      return;
    }

    listContainer.innerHTML = "";

    lessons.forEach(lesson => {
      const link = document.createElement("a");
      link.href = `/reading/${lesson.id}/`;
      link.textContent = lesson.title || `Lesson ${lesson.id}`;
      listContainer.appendChild(link);
      listContainer.appendChild(document.createElement("br"));
    });
  } catch (err) {
    console.error(err);
    listContainer.textContent = "Could not load lessons.";
  }
}

// ---------------- INIT APP ----------------
document.addEventListener("DOMContentLoaded", async () => {
  // Load list on listing page
  loadLessonList();

  // Load specific lesson if present
  const lessonSection = document.querySelector("[data-lesson-id]");
  const pageLessonId = lessonSection?.dataset.lessonId;
  if (pageLessonId) {
    await loadLesson(pageLessonId);
  }

  // Initialize TTS voices
  populateVoices();
  if (synth) {
    synth.onvoiceschanged = populateVoices;
  }

  // Initialize feature modules
  initTextReader();
  initListening();
  initFeedback();
});
