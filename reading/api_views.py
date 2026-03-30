# reading/api_views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
import json

from django.utils import timezone

from reading.services.phonetic_analysis import detect_phonetic_errors
from reading.services.analytics_service import AnalyticsService

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
        best_score = None
        is_completed = False
        total_attempts = 0

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

                # Extract word-level analytics using the service
                AnalyticsService.extract_word_analytics(attempt)

                # Update daily analytics
                AnalyticsService.update_daily_analytics(request.user)

                progress, created = LessonProgress.objects.get_or_create(
                    user=request.user,
                    lesson=lesson,
                )

                progress.total_attempts += 1
                total_attempts = progress.total_attempts

                if progress.best_score is None or score > progress.best_score:
                    progress.best_score = score
                    best_score = progress.best_score
                else:
                    best_score = progress.best_score

                if score >= 80 and not progress.is_completed:
                    progress.is_completed = True
                    is_completed = True
                else:
                    is_completed = progress.is_completed

                now = timezone.now()

                if not progress.first_attempt_at:
                    progress.first_attempt_at = now

                progress.last_attempt_at = now

                progress.save()

            except ReadingLesson.DoesNotExist:
                pass
            except Exception as e:
                # Log error but don't fail the request
                print(f"Analytics error: {e}")

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
                "best_score": best_score,
                "is_completed": is_completed,
                "total_attempts": total_attempts,
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------
# USER PROGRESS API
# ---------------------------------------------------

class UserProgressAPIView(APIView):
    """Get user's progress for a specific lesson."""

    def get(self, request, lesson_id):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            lesson = ReadingLesson.objects.get(pk=lesson_id)
        except ReadingLesson.DoesNotExist:
            return Response(
                {"error": "Lesson not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        progress = LessonProgress.objects.filter(
            user=request.user,
            lesson=lesson
        ).first()

        recent_attempts = PronunciationAttempt.objects.filter(
            lesson=lesson,
            user=request.user
        ).values('score', 'created_at', 'feedback')[:5]

        return Response(
            {
                "success": True,
                "progress": {
                    "best_score": progress.best_score if progress else None,
                    "total_attempts": progress.total_attempts if progress else 0,
                    "is_completed": progress.is_completed if progress else False,
                    "first_attempt_at": progress.first_attempt_at if progress else None,
                    "last_attempt_at": progress.last_attempt_at if progress else None,
                },
                "recent_attempts": list(recent_attempts),
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------
# DASHBOARD STATS API
# ---------------------------------------------------

class DashboardStatsAPIView(APIView):
    """Get overall dashboard statistics for the current user."""

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"error": "Authentication required"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Completed lessons count
        completed_count = LessonProgress.objects.filter(
            user=request.user,
            is_completed=True
        ).count()

        # Total lessons count
        total_lessons = ReadingLesson.objects.count()

        # Average best score across all lessons
        from django.db.models import Avg
        avg_score = LessonProgress.objects.filter(
            user=request.user
        ).exclude(best_score__isnull=True).aggregate(
            avg=Avg('best_score')
        )['avg'] or 0

        # Total attempts
        total_attempts = PronunciationAttempt.objects.filter(
            user=request.user
        ).count()

        # Improvement over time (last 5 attempts)
        recent_attempts = PronunciationAttempt.objects.filter(
            user=request.user
        ).order_by('-created_at')[:5]

        improvement_trend = [{
            'score': a.score,
            'date': a.created_at.strftime('%Y-%m-%d')
        } for a in reversed(recent_attempts)]

        return Response(
            {
                "success": True,
                "stats": {
                    "completed_lessons": completed_count,
                    "total_lessons": total_lessons,
                    "average_score": round(avg_score, 1),
                    "total_attempts": total_attempts,
                    "improvement_trend": improvement_trend,
                }
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