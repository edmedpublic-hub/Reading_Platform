from django.urls import path
from .api_views import (
    ReadingLessonListAPIView,
    ReadingLessonDetailAPIView,
    TextFeedbackAPIView,
    AudioFeedbackAPIView,
)

app_name = "reading_api"

urlpatterns = [
    # Lesson endpoints
    path("lessons/", ReadingLessonListAPIView.as_view(), name="lesson-list"),
    path("lessons/<int:pk>/", ReadingLessonDetailAPIView.as_view(), name="lesson-detail"),
    
    # Feedback endpoints
    path("feedback/", TextFeedbackAPIView.as_view(), name="feedback"),
    path("audio-feedback/", AudioFeedbackAPIView.as_view(), name="audio-feedback"),
]