# reading/services/analytics_service.py
from django.utils import timezone
from django.db.models import Count, Avg, Q, F, Value, FloatField
from django.db.models.functions import Coalesce
from reading.models import (
    UserAnalytics, 
    WordAnalytics, 
    PronunciationAttempt, 
    LessonProgress,
    ReadingLesson
)
from datetime import timedelta
import re


class AnalyticsService:
    """Service for tracking and retrieving user analytics"""
    
    @staticmethod
    def extract_word_analytics(attempt):
        """Extract and save word-level analytics from a pronunciation attempt"""
        if not attempt.user or not attempt.expected:
            return
        
        # Words that were mispronounced (from mispronounced list)
        mispronounced_words = []
        for item in attempt.mispronounced or []:
            if isinstance(item, dict):
                word = item.get('word', '')
            elif isinstance(item, str):
                word = item
            else:
                continue
            if word:
                mispronounced_words.append(word.lower().strip())
        
        # Split expected text into words (clean punctuation)
        expected_words = re.findall(r'\b[\w\']+\b', attempt.expected.lower())
        
        # Track word performance
        for word in expected_words:
            if not word or len(word) < 2:  # Skip short words
                continue
            
            is_correct = word not in mispronounced_words
            
            # Get or create WordAnalytics record
            try:
                word_analytics, created = WordAnalytics.objects.get_or_create(
                    user=attempt.user,
                    word=word,
                    lesson=attempt.lesson,
                    defaults={
                        'total_attempts': 1,
                        'correct_attempts': 1 if is_correct else 0,
                        'last_attempt_at': attempt.created_at or timezone.now()
                    }
                )
                
                if not created:
                    # Update existing record
                    word_analytics.total_attempts += 1
                    if is_correct:
                        word_analytics.correct_attempts += 1
                    word_analytics.last_attempt_at = attempt.created_at or timezone.now()
                    word_analytics.save()
                    
            except Exception as e:
                print(f"Error saving word analytics for '{word}': {e}")
                continue
    
    @staticmethod
    def update_daily_analytics(user):
        """Update daily analytics for a user"""
        today = timezone.now().date()
        
        # Get today's attempts
        today_attempts = PronunciationAttempt.objects.filter(
            user=user,
            created_at__date=today
        )
        
        # Calculate stats
        total_attempts = today_attempts.count()
        avg_score = today_attempts.aggregate(avg=Avg('score'))['avg'] or 0
        
        # Get completed lessons today
        completed_today = LessonProgress.objects.filter(
            user=user,
            is_completed=True,
            updated_at__date=today
        ).count()
        
        # Calculate total practice time (approximate from attempts)
        total_time = 0
        for attempt in today_attempts:
            word_count = len(attempt.spoken.split()) if attempt.spoken else 0
            total_time += word_count * 5
        
        # Get words practiced today (from mispronounced words)
        words_practiced = set()
        for attempt in today_attempts:
            for item in attempt.mispronounced or []:
                if isinstance(item, dict):
                    word = item.get('word', '')
                elif isinstance(item, str):
                    word = item
                else:
                    continue
                if word:
                    words_practiced.add(word)
        
        # Use get_or_create to avoid F() expression issues
        analytics, created = UserAnalytics.objects.get_or_create(
            user=user,
            date=today,
            defaults={
                'total_attempts': total_attempts,
                'avg_score': round(avg_score, 1),
                'lessons_completed': completed_today,
                'total_practice_time': total_time,
                'words_practiced': list(words_practiced)[:50]
            }
        )
        
        if not created:
            # Update existing record
            analytics.total_attempts = total_attempts
            analytics.avg_score = round(avg_score, 1)
            analytics.lessons_completed = completed_today
            analytics.total_practice_time = total_time
            analytics.words_practiced = list(words_practiced)[:50]
            analytics.save()
        
        return analytics
    
    @staticmethod
    def get_user_weak_words(user, limit=10):
        """Get user's weakest words"""
        words = WordAnalytics.objects.filter(
            user=user,
            total_attempts__gte=3  # Minimum attempts to consider
        )
        
        # Calculate success rate and filter words that need practice
        weak_words = []
        for word in words:
            success_rate = word.success_rate()
            if success_rate < 80:  # Words with less than 80% success rate
                weak_words.append({
                    'word': word.word,
                    'total_attempts': word.total_attempts,
                    'correct_attempts': word.correct_attempts,
                    'success_rate': success_rate,
                    'last_attempt_at': word.last_attempt_at
                })
        
        # Sort by success rate (lowest first)
        weak_words.sort(key=lambda x: x['success_rate'])
        
        return weak_words[:limit]
    
    @staticmethod
    def get_user_strengths(user, limit=10):
        """Get user's strongest words"""
        words = WordAnalytics.objects.filter(
            user=user,
            total_attempts__gte=2  # Minimum attempts to consider
        )
        
        strengths = []
        for word in words:
            success_rate = word.success_rate()
            if success_rate >= 80:  # Words with 80% or higher success rate
                strengths.append({
                    'word': word.word,
                    'total_attempts': word.total_attempts,
                    'correct_attempts': word.correct_attempts,
                    'success_rate': success_rate,
                    'last_attempt_at': word.last_attempt_at
                })
        
        # Sort by success rate (highest first)
        strengths.sort(key=lambda x: x['success_rate'], reverse=True)
        
        return strengths[:limit]
    
    @staticmethod
    def get_weekly_progress(user):
        """Get weekly progress data for charts"""
        last_7_days = timezone.now() - timedelta(days=7)
        
        daily_stats = UserAnalytics.objects.filter(
            user=user,
            date__gte=last_7_days
        ).order_by('date')
        
        # If no daily stats, calculate from attempts
        if not daily_stats.exists():
            # Get attempts from last 7 days
            attempts = PronunciationAttempt.objects.filter(
                user=user,
                created_at__gte=last_7_days
            )
            
            # Group by date
            from collections import defaultdict
            daily_data = defaultdict(lambda: {'scores': [], 'attempts': 0})
            
            for attempt in attempts:
                date_str = attempt.created_at.date().strftime('%Y-%m-%d')
                daily_data[date_str]['scores'].append(attempt.score or 0)
                daily_data[date_str]['attempts'] += 1
            
            dates = sorted(daily_data.keys())
            scores = [sum(daily_data[d]['scores']) / len(daily_data[d]['scores']) if daily_data[d]['scores'] else 0 for d in dates]
            attempts_count = [daily_data[d]['attempts'] for d in dates]
            
            return {
                'dates': dates,
                'scores': [round(s, 1) for s in scores],
                'attempts': attempts_count
            }
        
        return {
            'dates': [stat.date.strftime('%Y-%m-%d') for stat in daily_stats],
            'scores': [round(stat.avg_score, 1) for stat in daily_stats],
            'attempts': [stat.total_attempts for stat in daily_stats]
        }
    
    @staticmethod
    def get_global_weak_words(limit=20):
        """Get most commonly mispronounced words across all users"""
        words = WordAnalytics.objects.filter(
            total_attempts__gte=5
        )
        
        global_weak = []
        for word in words:
            failure_rate = 100 - word.success_rate()
            if failure_rate > 30:  # Only include words with >30% failure rate
                global_weak.append({
                    'word': word.word,
                    'total_attempts': word.total_attempts,
                    'correct_attempts': word.correct_attempts,
                    'success_rate': word.success_rate(),
                    'failure_rate': round(failure_rate, 1),
                    'unique_users': WordAnalytics.objects.filter(
                        word=word.word
                    ).values('user').distinct().count()
                })
        
        # Sort by failure rate (highest first)
        global_weak.sort(key=lambda x: x['failure_rate'], reverse=True)
        
        return global_weak[:limit]
    
    @staticmethod
    def get_user_overall_stats(user):
        """Get overall statistics for a user"""
        # Total attempts
        total_attempts = PronunciationAttempt.objects.filter(user=user).count()
        
        # Average score
        avg_score = PronunciationAttempt.objects.filter(
            user=user,
            score__isnull=False
        ).aggregate(avg=Avg('score'))['avg'] or 0
        
        # Completed lessons
        completed_lessons = LessonProgress.objects.filter(
            user=user,
            is_completed=True
        ).count()
        
        # Total lessons
        total_lessons = ReadingLesson.objects.count()
        
        # Words mastered (success rate >= 80% with at least 3 attempts)
        mastered_words = WordAnalytics.objects.filter(
            user=user,
            total_attempts__gte=3
        ).count()
        
        # Words needing practice (success rate < 60% with at least 2 attempts)
        words_to_practice = WordAnalytics.objects.filter(
            user=user,
            total_attempts__gte=2
        ).count()
        
        # Calculate actual practice words count based on success rate
        practice_words = 0
        for word in WordAnalytics.objects.filter(user=user, total_attempts__gte=2):
            if word.success_rate() < 60:
                practice_words += 1
        
        return {
            'total_attempts': total_attempts,
            'average_score': round(avg_score, 1),
            'completed_lessons': completed_lessons,
            'total_lessons': total_lessons,
            'mastered_words': mastered_words,
            'words_to_practice': practice_words,
            'completion_rate': round((completed_lessons / total_lessons * 100), 1) if total_lessons > 0 else 0
        }
    
    @staticmethod
    def get_difficult_lessons(user, limit=10):
        """Get lessons where user struggles most"""
        progress_records = LessonProgress.objects.filter(
            user=user,
            total_attempts__gte=2
        ).select_related('lesson').order_by('best_score')
        
        difficult = []
        for progress in progress_records:
            if progress.best_score and progress.best_score < 80:
                difficult.append({
                    'lesson_id': progress.lesson.id,
                    'lesson_title': progress.lesson.title,
                    'best_score': round(progress.best_score, 1),
                    'total_attempts': progress.total_attempts,
                    'is_completed': progress.is_completed
                })
        
        return difficult[:limit]