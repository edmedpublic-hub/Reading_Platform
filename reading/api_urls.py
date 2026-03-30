from django.urls import path

from .api_views import (
    ReadingLessonListAPIView,
    ReadingLessonDetailAPIView,
    TextFeedbackAPIView,
    AudioFeedbackAPIView,
)

from .progress_api import (
    StudentProgressAPIView,
    LessonProgressDetailAPIView,
    LessonLeaderboardAPIView,
)
from .analytics_api import (
    StudentWeakWordsAPIView,
    DifficultLessonsAPIView,
    GlobalWeakWordsAPIView,
)

app_name = "reading_api"

urlpatterns = [

    # -------------------------
    # LESSONS
    # -------------------------

    path(
        "lessons/",
        ReadingLessonListAPIView.as_view(),
        name="lesson-list"
    ),

    path(
        "lessons/<int:pk>/",
        ReadingLessonDetailAPIView.as_view(),
        name="lesson-detail"
    ),

    # -------------------------
    # PRONUNCIATION FEEDBACK
    # -------------------------

    path(
        "feedback/",
        TextFeedbackAPIView.as_view(),
        name="feedback"
    ),

    path(
        "audio-feedback/",
        AudioFeedbackAPIView.as_view(),
        name="audio-feedback"
    ),

    # -------------------------
    # PROGRESS APIs
    # -------------------------

    path(
        "progress/student/",
        StudentProgressAPIView.as_view(),
        name="student-progress"
    ),

    path(
        "progress/lesson/<int:lesson_id>/",
        LessonProgressDetailAPIView.as_view(),
        name="lesson-progress"
    ),

    path(
        "leaderboard/<int:lesson_id>/",
        LessonLeaderboardAPIView.as_view(),
        name="lesson-leaderboard"
    ),
    
    path(
    "analytics/weak-words/",
    StudentWeakWordsAPIView.as_view(),
    name="weak-words"
),

path(
    "analytics/difficult-lessons/",
    DifficultLessonsAPIView.as_view(),
    name="difficult-lessons"
),

path(
    "analytics/global-weak-words/",
    GlobalWeakWordsAPIView.as_view(),
    name="global-weak-words"
),
]