# reading/api_views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from django.utils import timezone

from reading.services.phonetic_analysis import detect_phonetic_errors

from .models import (
    ReadingLesson,
    PronunciationAttempt,
    LessonProgress,
)

from .serializers import ReadingLessonSerializer

from .services.pronunciation_engine import (
    word_by_word_comparison,
    generate_feedback,
)


# ---------------------------------------------------
# LESSON LIST
# ---------------------------------------------------

class ReadingLessonListAPIView(APIView):
    """Return a list of all reading lessons."""

    def get(self, request):

        lessons = ReadingLesson.objects.all()
        serializer = ReadingLessonSerializer(lessons, many=True)

        return Response(serializer.data)


# ---------------------------------------------------
# LESSON DETAIL
# ---------------------------------------------------

class ReadingLessonDetailAPIView(APIView):
    """Return details of a single lesson."""

    def get(self, request, pk):

        try:
            lesson = ReadingLesson.objects.get(pk=pk)

        except ReadingLesson.DoesNotExist:

            return Response(
                {"error": "Lesson not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ReadingLessonSerializer(lesson)

        return Response(serializer.data)


# ---------------------------------------------------
# TEXT FEEDBACK API
# ---------------------------------------------------

class TextFeedbackAPIView(APIView):
    """
    Accepts JSON payload:

    {
        "expected": "...",
        "spoken": "...",
        "lesson_id": 3
    }

    Returns pronunciation score and feedback.
    """

    def post(self, request):

        data = request.data

        expected = data.get("expected", "").strip()
        spoken = data.get("spoken", "").strip()
        lesson_id = data.get("lesson_id")

        # ---------------------------
        # VALIDATION
        # ---------------------------

        if not spoken:

            return Response(
                {"score": 0, "feedback": "No speech text received."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not expected:

            return Response(
                {"score": 0, "feedback": "No expected text available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ---------------------------
        # RUN PRONUNCIATION ANALYSIS
        # ---------------------------

        problem_words, score = word_by_word_comparison(expected, spoken)
        phonetic_errors = detect_phonetic_errors(problem_words)

        feedback_text = generate_feedback(problem_words, score)

        mispronounced_only = [
            w for w in problem_words if w["status"] != "correct"
        ]

        attempt_id = None

        # ---------------------------
        # SAVE ATTEMPT + UPDATE PROGRESS
        # ---------------------------

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
                    feedback=feedback_text,
                )

                attempt_id = attempt.id

                progress, created = LessonProgress.objects.get_or_create(
                    user=request.user,
                    lesson=lesson,
                )

                progress.total_attempts += 1

                if progress.best_score is None or score > progress.best_score:
                    progress.best_score = score

                if score >= 80:
                    progress.is_completed = True

                now = timezone.now()

                if not progress.first_attempt_at:
                    progress.first_attempt_at = now

                progress.last_attempt_at = now

                progress.save()

            except ReadingLesson.DoesNotExist:
                pass

        # ---------------------------
        # RESPONSE
        # ---------------------------

        return Response(
            {
                "score": score,
                "feedback": feedback_text,
                "mispronounced": mispronounced_only,
                "phonetic_errors": phonetic_errors,
                "attempt_id": attempt_id,
                "word_count": len(expected.split()),
                "problem_count": len(mispronounced_only),
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------
# AUDIO FEEDBACK (FUTURE)
# ---------------------------------------------------

class AudioFeedbackAPIView(APIView):
    """Audio pronunciation scoring (future implementation)."""

    def post(self, request):

        return Response(
            {
                "error": (
                    "Audio processing temporarily disabled. "
                    "Use text feedback for now."
                )
            },
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )