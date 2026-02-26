# reading/api_urls.py

from django.urls import path
from .api_views import (
    ReadingLessonListAPIView,
    ReadingLessonDetailAPIView,
    TextFeedbackAPIView,
    AudioFeedbackAPIView,
)

urlpatterns = [
    # Lessons list
    path("lessons/", ReadingLessonListAPIView.as_view(), name="lesson-list"),

    # Lesson detail
    path("lessons/<int:pk>/", ReadingLessonDetailAPIView.as_view(), name="lesson-detail"),

    # Text feedback (DRF APIView, CSRF handled automatically)
    path("feedback/", TextFeedbackAPIView.as_view(), name="text-feedback"),

    # Audio feedback (stub endpoint)
    path("audio-feedback/", AudioFeedbackAPIView.as_view(), name="audio-feedback"),
]