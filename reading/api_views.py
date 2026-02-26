# reading/api_views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import ReadingLesson
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
# TEXT FEEDBACK
# ---------------------------------------------------
class TextFeedbackAPIView(APIView):
    """
    Accepts JSON payload:
    {
        "expected": "...",
        "spoken": "...",
        "lesson_id": 3
    }
    Returns score, feedback, and mispronounced words.
    """

    def post(self, request):
        data = request.data
        spoken = data.get("spoken", "").strip()

        if not spoken:
            return Response(
                {"score": 0, "feedback": "No speech text received."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Placeholder scoring logic
        score = 70
        feedback = "Good attempt! Keep practicing."

        # Simulated mispronounced words for frontend highlighting
        simulated_mispronounced = [
            {"word": "attempt", "offset": 10, "duration": 500},
            {"word": "practicing", "offset": 30, "duration": 800},
        ]

        return Response(
            {
                "score": score,
                "feedback": feedback,
                "mispronounced": simulated_mispronounced,
                "attempt_id": None,
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