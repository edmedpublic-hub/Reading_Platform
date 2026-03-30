# reading/analytics_api.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count, Avg
from django.utils import timezone

from .models import (
    PronunciationAttempt,
    ReadingLesson,
    LessonProgress,
    WordAnalytics,
    UserAnalytics
)
from .services.analytics_service import AnalyticsService


# ---------------------------------------------------
# STUDENT MISPRONUNCIATION ANALYSIS
# ---------------------------------------------------

class StudentWeakWordsAPIView(APIView):
    """
    Returns the most frequently mispronounced words
    for the logged-in student using analytics service.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get weak words from analytics service
        weak_words = AnalyticsService.get_user_weak_words(request.user, limit=20)
        
        # Also get word count from attempts for additional context
        attempts = PronunciationAttempt.objects.filter(user=request.user)
        
        word_counter = {}
        for attempt in attempts:
            words = attempt.mispronounced or []
            for entry in words:
                if isinstance(entry, dict):
                    word = entry.get("word", "")
                elif isinstance(entry, str):
                    word = entry
                else:
                    continue
                if word:
                    word_counter[word] = word_counter.get(word, 0) + 1
        
        # Combine data from both sources
        result = []
        for word_data in weak_words:
            word = word_data['word']
            result.append({
                "word": word,
                "mistake_count": word_counter.get(word, word_data.get('total_attempts', 0)),
                "success_rate": word_data.get('success_rate', 0),
                "total_attempts": word_data.get('total_attempts', 0),
                "correct_attempts": word_data.get('correct_attempts', 0)
            })
        
        return Response({
            "student": request.user.username,
            "weak_words": result,
            "total_weak_words": len(result)
        })


# ---------------------------------------------------
# USER STRENGTHS ANALYSIS
# ---------------------------------------------------

class UserStrengthsAPIView(APIView):
    """
    Returns words that the user has mastered.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        strengths = AnalyticsService.get_user_strengths(request.user, limit=20)
        
        return Response({
            "student": request.user.username,
            "strengths": strengths,
            "total_strengths": len(strengths)
        })


# ---------------------------------------------------
# LESSON DIFFICULTY ANALYSIS
# ---------------------------------------------------

class DifficultLessonsAPIView(APIView):
    """
    Identify lessons where students struggle the most.
    Now uses analytics service for better data.
    """

    def get(self, request):
        # If user is authenticated, get personal difficult lessons
        if request.user.is_authenticated:
            difficult_lessons = AnalyticsService.get_difficult_lessons(request.user, limit=10)
            return Response({
                "user": request.user.username,
                "difficult_lessons": difficult_lessons,
                "type": "personal"
            })
        
        # Otherwise, return global lesson difficulty
        attempts = PronunciationAttempt.objects.all()
        
        lesson_stats = {}
        lesson_attempts = {}
        
        for attempt in attempts:
            if not attempt.lesson_id:
                continue
            lesson_id = attempt.lesson_id
            score = attempt.score or 0
            
            if lesson_id not in lesson_stats:
                try:
                    lesson = ReadingLesson.objects.get(id=lesson_id)
                    lesson_stats[lesson_id] = {
                        'title': lesson.title,
                        'total_score': 0,
                        'count': 0
                    }
                except ReadingLesson.DoesNotExist:
                    continue
            
            lesson_stats[lesson_id]['total_score'] += score
            lesson_stats[lesson_id]['count'] += 1
        
        difficulty_list = []
        for lesson_id, stats in lesson_stats.items():
            avg_score = stats['total_score'] / stats['count'] if stats['count'] > 0 else 0
            difficulty_list.append({
                "lesson_id": lesson_id,
                "lesson_title": stats['title'],
                "average_score": round(avg_score, 2),
                "attempts": stats['count'],
                "difficulty_level": "hard" if avg_score < 50 else "medium" if avg_score < 75 else "easy"
            })
        
        difficulty_list.sort(key=lambda x: x["average_score"])
        
        return Response({
            "difficult_lessons": difficulty_list[:10],
            "type": "global"
        })


# ---------------------------------------------------
# GLOBAL MISPRONUNCIATION ANALYSIS
# ---------------------------------------------------

class GlobalWeakWordsAPIView(APIView):
    """
    Shows words most mispronounced across all students.
    Uses analytics service for comprehensive data.
    """

    def get(self, request):
        # Get global weak words from analytics service
        global_weak = AnalyticsService.get_global_weak_words(limit=30)
        
        # Also calculate from raw attempts for comparison
        attempts = PronunciationAttempt.objects.all()
        
        word_counter = {}
        for attempt in attempts:
            words = attempt.mispronounced or []
            for entry in words:
                if isinstance(entry, dict):
                    word = entry.get("word", "")
                elif isinstance(entry, str):
                    word = entry
                else:
                    continue
                if word:
                    word_counter[word] = word_counter.get(word, 0) + 1
        
        # Combine and enrich data
        result = []
        for word_data in global_weak:
            word = word_data['word']
            result.append({
                "word": word,
                "mistake_count": word_counter.get(word, word_data.get('total_attempts', 0)),
                "success_rate": word_data.get('success_rate', 0),
                "failure_rate": word_data.get('failure_rate', 0),
                "total_attempts": word_data.get('total_attempts', 0),
                "unique_users": word_data.get('unique_users', 0)
            })
        
        return Response({
            "global_problem_words": result,
            "total_words_analyzed": len(result),
            "last_updated": timezone.now().isoformat()
        })


# ---------------------------------------------------
# WEEKLY PROGRESS ANALYSIS
# ---------------------------------------------------

class WeeklyProgressAPIView(APIView):
    """
    Returns weekly progress data for charts.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        progress = AnalyticsService.get_weekly_progress(request.user)
        
        # Get overall stats
        overall_stats = AnalyticsService.get_user_overall_stats(request.user)
        
        return Response({
            "success": True,
            "weekly_progress": progress,
            "overall_stats": overall_stats
        })


# ---------------------------------------------------
# OVERALL DASHBOARD STATS
# ---------------------------------------------------

class DashboardStatsAPIView(APIView):
    """
    Returns comprehensive dashboard statistics for the user.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get overall stats
        overall_stats = AnalyticsService.get_user_overall_stats(request.user)
        
        # Get recent attempts
        recent_attempts = PronunciationAttempt.objects.filter(
            user=request.user
        ).select_related('lesson').values(
            'id', 'score', 'feedback', 'created_at', 'lesson__title'
        )[:10]
        
        # Get weak words
        weak_words = AnalyticsService.get_user_weak_words(request.user, limit=5)
        
        # Get strengths
        strengths = AnalyticsService.get_user_strengths(request.user, limit=5)
        
        # Get difficult lessons
        difficult_lessons = AnalyticsService.get_difficult_lessons(request.user, limit=5)
        
        # Calculate trend (improvement over last 5 attempts)
        last_5_attempts = PronunciationAttempt.objects.filter(
            user=request.user,
            score__isnull=False
        ).order_by('-created_at')[:5]
        
        scores = [a.score for a in reversed(last_5_attempts)]
        trend = "stable"
        if len(scores) >= 2:
            if scores[-1] > scores[0]:
                trend = "improving"
            elif scores[-1] < scores[0]:
                trend = "declining"
        
        return Response({
            "success": True,
            "stats": overall_stats,
            "trend": trend,
            "recent_attempts": list(recent_attempts),
            "weak_words": weak_words[:5],
            "strengths": strengths[:5],
            "difficult_lessons": difficult_lessons[:5]
        })


# ---------------------------------------------------
# WORD DETAIL ANALYSIS
# ---------------------------------------------------

class WordDetailAPIView(APIView):
    """
    Returns detailed analysis for a specific word.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, word):
        # Get user's word analytics
        word_stats = WordAnalytics.objects.filter(
            user=request.user,
            word__iexact=word
        ).first()
        
        if not word_stats:
            return Response({
                "success": False,
                "message": f"No data found for word: {word}"
            }, status=404)
        
        # Get all attempts containing this word
        attempts = PronunciationAttempt.objects.filter(
            user=request.user
        )
        
        word_attempts = []
        for attempt in attempts:
            if word.lower() in attempt.expected.lower():
                was_mispronounced = False
                for item in attempt.mispronounced or []:
                    item_word = item.get("word", "") if isinstance(item, dict) else str(item)
                    if word.lower() == item_word.lower():
                        was_mispronounced = True
                        break
                
                word_attempts.append({
                    "date": attempt.created_at,
                    "score": attempt.score,
                    "was_correct": not was_mispronounced,
                    "context": attempt.expected[:100] if attempt.expected else ""
                })
        
        return Response({
            "success": True,
            "word": word,
            "statistics": {
                "total_attempts": word_stats.total_attempts,
                "correct_attempts": word_stats.correct_attempts,
                "success_rate": word_stats.success_rate(),
                "last_attempt": word_stats.last_attempt_at
            },
            "recent_attempts": [
                {
                    "date": a["date"],
                    "score": a["score"],
                    "was_correct": a["was_correct"],
                    "context": a["context"]
                }
                for a in word_attempts[-10:]
            ]
        })