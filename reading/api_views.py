# reading/api_views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from difflib import SequenceMatcher
import re

from .models import ReadingLesson, PronunciationAttempt
from .serializers import ReadingLessonSerializer


# ---------------------------------------------------
# LESSON LIST & DETAIL
# ---------------------------------------------------
class ReadingLessonListAPIView(APIView):
    """Return a list of all reading lessons."""
    def get(self, request):
        lessons = ReadingLesson.objects.all()
        serializer = ReadingLessonSerializer(lessons, many=True)
        return Response(serializer.data)


class ReadingLessonDetailAPIView(APIView):
    """Return details of a single lesson by ID."""
    def get(self, request, pk):
        try:
            lesson = ReadingLesson.objects.get(pk=pk)
        except ReadingLesson.DoesNotExist:
            return Response(
                {"error": "Lesson not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = ReadingLessonSerializer(lesson)
        return Response(serializer.data)


# ---------------------------------------------------
# HELPER FUNCTIONS FOR PRONUNCIATION ANALYSIS
# ---------------------------------------------------
def normalize_text(text):
    """Remove punctuation and convert to lowercase for comparison."""
    # Remove punctuation and extra spaces
    text = re.sub(r'[^\w\s]', '', text.lower())
    # Remove extra spaces
    text = ' '.join(text.split())
    return text

def word_by_word_comparison(expected, spoken):
    """
    Compare expected text with spoken text word by word.
    Returns list of mispronounced words and accuracy score.
    """
    # Normalize both texts
    expected_norm = normalize_text(expected)
    spoken_norm = normalize_text(spoken)
    
    # Split into words
    expected_words = expected_norm.split()
    spoken_words = spoken_norm.split()
    
    problem_words = []
    correct_count = 0
    total_words = len(expected_words)
    
    # Use SequenceMatcher for fuzzy matching
    matcher = SequenceMatcher(None, expected_words, spoken_words)
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            # Words match exactly
            correct_count += (i2 - i1)
            for idx in range(i1, i2):
                problem_words.append({
                    'word': expected_words[idx],
                    'heard': expected_words[idx],
                    'position': idx,
                    'status': 'correct'
                })
        
        elif tag == 'replace':
            # Words don't match
            for idx in range(i1, i2):
                heard_word = spoken_words[j1 + (idx - i1)] if (j1 + (idx - i1)) < len(spoken_words) else '[missing]'
                problem_words.append({
                    'word': expected_words[idx],
                    'heard': heard_word,
                    'position': idx,
                    'status': 'mispronounced'
                })
        
        elif tag == 'delete':
            # Expected word missing in spoken
            for idx in range(i1, i2):
                problem_words.append({
                    'word': expected_words[idx],
                    'heard': '[missing]',
                    'position': idx,
                    'status': 'missing'
                })
        
        elif tag == 'insert':
            # Extra word in spoken (ignore for scoring)
            pass
    
    # Calculate score (percentage of correctly spoken words)
    score = (correct_count / total_words) * 100 if total_words > 0 else 0
    
    return problem_words, round(score, 2)

def generate_feedback(problem_words, score):
    """Generate human-readable feedback based on analysis."""
    total_problems = len([w for w in problem_words if w['status'] != 'correct'])
    
    if score >= 90:
        if total_problems == 0:
            return "🌟 Excellent! Perfect pronunciation. You read every word correctly!"
        else:
            return f"🌟 Great job! Just {total_problems} word(s) need a little practice."
    
    elif score >= 75:
        return f"👍 Good effort! Focus on practicing these {total_problems} word(s). Try reading them slowly."
    
    elif score >= 50:
        return f"📝 Keep practicing! You missed {total_problems} word(s). Try listening to the audio and repeating."
    
    else:
        return "🎯 Let's start over. Listen to the audio carefully and try reading one sentence at a time."


# ---------------------------------------------------
# TEXT FEEDBACK - REAL IMPLEMENTATION
# ---------------------------------------------------
class TextFeedbackAPIView(APIView):
    """
    Accepts JSON payload:
    {
        "expected": "...",
        "spoken": "...",
        "lesson_id": 3 (optional)
    }
    Returns real score, feedback, and mispronounced words.
    """

    def post(self, request):
        data = request.data
        expected = data.get("expected", "").strip()
        spoken = data.get("spoken", "").strip()
        lesson_id = data.get("lesson_id")
        
        if not spoken:
            return Response(
                {"score": 0, "feedback": "No speech text received."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not expected:
            return Response(
                {"score": 0, "feedback": "No expected text available for comparison."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Perform real pronunciation analysis
        problem_words, score = word_by_word_comparison(expected, spoken)
        feedback_text = generate_feedback(problem_words, score)
        
        # Filter to only problematic words for the frontend
        mispronounced_only = [w for w in problem_words if w['status'] != 'correct']
        
        # Save to database if user is authenticated and lesson_id provided
        attempt_id = None
        if request.user.is_authenticated and lesson_id:
            try:
                lesson = ReadingLesson.objects.get(pk=lesson_id)
                attempt = PronunciationAttempt.objects.create(
                    user=request.user,
                    lesson=lesson,
                    expected=expected,
                    spoken=spoken,
                    score=score,
                    mispronounced=mispronounced_only,
                    feedback=feedback_text
                )
                attempt_id = attempt.id
            except ReadingLesson.DoesNotExist:
                pass  # Don't save if lesson doesn't exist
        
        return Response(
            {
                "score": score,
                "feedback": feedback_text,
                "mispronounced": mispronounced_only,
                "attempt_id": attempt_id,
                "word_count": len(expected.split()),
                "problem_count": len(mispronounced_only)
            },
            status=status.HTTP_200_OK
        )


# ---------------------------------------------------
# AUDIO FEEDBACK
# ---------------------------------------------------
class AudioFeedbackAPIView(APIView):
    """Stub endpoint for audio feedback (not yet implemented)."""
    def post(self, request):
        return Response(
            {"error": "Audio processing temporarily disabled. Use text feedback only for now."},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )