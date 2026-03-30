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
    UserStrengthsAPIView,
    WeeklyProgressAPIView,
    DashboardStatsAPIView,
    WordDetailAPIView,
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

    # -------------------------
    # ANALYTICS APIs
    # -------------------------
    # Personal Analytics
    path(
        "analytics/weak-words/",
        StudentWeakWordsAPIView.as_view(),
        name="weak-words"
    ),
    path(
        "analytics/user-strengths/",
        UserStrengthsAPIView.as_view(),
        name="user-strengths"
    ),
    path(
        "analytics/weekly-progress/",
        WeeklyProgressAPIView.as_view(),
        name="weekly-progress"
    ),
    path(
        "analytics/dashboard-stats/",
        DashboardStatsAPIView.as_view(),
        name="dashboard-stats"
    ),
    path(
        "analytics/word/<str:word>/",
        WordDetailAPIView.as_view(),
        name="word-detail"
    ),
    
    # Global Analytics
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