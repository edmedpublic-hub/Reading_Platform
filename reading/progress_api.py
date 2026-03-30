# reading/progress_api.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.db.models import Avg

from .models import LessonProgress, ReadingLesson


# ---------------------------------------------------
# STUDENT PROGRESS DASHBOARD
# ---------------------------------------------------

class StudentProgressAPIView(APIView):
    """
    Returns progress statistics for the logged-in student.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):

        user = request.user

        progress_records = LessonProgress.objects.filter(user=user)

        total_lessons = ReadingLesson.objects.count()

        completed_lessons = progress_records.filter(
            is_completed=True
        ).count()

        total_attempts = sum(p.total_attempts for p in progress_records)

        best_average = progress_records.aggregate(
            Avg("best_score")
        )["best_score__avg"]

        completion_percentage = 0

        if total_lessons > 0:
            completion_percentage = round(
                (completed_lessons / total_lessons) * 100,
                2
            )

        data = {
            "student": user.username,
            "total_lessons": total_lessons,
            "completed_lessons": completed_lessons,
            "completion_percentage": completion_percentage,
            "total_attempts": total_attempts,
            "average_best_score": best_average,
        }

        return Response(data)


# ---------------------------------------------------
# LESSON PROGRESS DETAILS
# ---------------------------------------------------

class LessonProgressDetailAPIView(APIView):
    """
    Returns progress for a specific lesson for the logged-in student.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, lesson_id):

        user = request.user

        try:

            progress = LessonProgress.objects.get(
                user=user,
                lesson_id=lesson_id
            )

            data = {
                "lesson_id": lesson_id,
                "total_attempts": progress.total_attempts,
                "best_score": progress.best_score,
                "is_completed": progress.is_completed,
                "first_attempt_at": progress.first_attempt_at,
                "last_attempt_at": progress.last_attempt_at,
            }

        except LessonProgress.DoesNotExist:

            data = {
                "lesson_id": lesson_id,
                "total_attempts": 0,
                "best_score": None,
                "is_completed": False,
                "first_attempt_at": None,
                "last_attempt_at": None,
            }

        return Response(data)


# ---------------------------------------------------
# LESSON LEADERBOARD (OPTIONAL)
# ---------------------------------------------------

class LessonLeaderboardAPIView(APIView):
    """
    Shows top pronunciation scores for a lesson.
    """

    def get(self, request, lesson_id):

        top_scores = LessonProgress.objects.filter(
            lesson_id=lesson_id
        ).order_by("-best_score")[:10]

        leaderboard = []

        for record in top_scores:

            leaderboard.append({
                "student": record.user.username,
                "best_score": record.best_score,
                "attempts": record.total_attempts,
            })

        return Response({
            "lesson_id": lesson_id,
            "leaderboard": leaderboard
        })