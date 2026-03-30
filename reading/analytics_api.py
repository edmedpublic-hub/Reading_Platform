# reading/analytics_api.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from django.db.models import Count

from .models import PronunciationAttempt


# ---------------------------------------------------
# STUDENT MISPRONUNCIATION ANALYSIS
# ---------------------------------------------------

class StudentWeakWordsAPIView(APIView):
    """
    Returns the most frequently mispronounced words
    for the logged-in student.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):

        attempts = PronunciationAttempt.objects.filter(
            user=request.user
        )

        word_counter = {}

        for attempt in attempts:

            words = attempt.mispronounced or []

            for entry in words:

                word = entry.get("word")

                if not word:
                    continue

                word_counter[word] = word_counter.get(word, 0) + 1

        sorted_words = sorted(
            word_counter.items(),
            key=lambda x: x[1],
            reverse=True
        )

        result = [
            {
                "word": word,
                "mistake_count": count
            }
            for word, count in sorted_words[:20]
        ]

        return Response({
            "student": request.user.username,
            "weak_words": result
        })


# ---------------------------------------------------
# LESSON DIFFICULTY ANALYSIS
# ---------------------------------------------------

class DifficultLessonsAPIView(APIView):
    """
    Identify lessons where students struggle the most.
    """

    def get(self, request):

        attempts = PronunciationAttempt.objects.all()

        lesson_scores = {}

        lesson_attempts = {}

        for attempt in attempts:

            lesson_id = attempt.lesson_id
            score = attempt.score or 0

            lesson_scores[lesson_id] = lesson_scores.get(lesson_id, 0) + score
            lesson_attempts[lesson_id] = lesson_attempts.get(lesson_id, 0) + 1

        difficulty_list = []

        for lesson_id in lesson_scores:

            avg_score = lesson_scores[lesson_id] / lesson_attempts[lesson_id]

            difficulty_list.append({
                "lesson_id": lesson_id,
                "average_score": round(avg_score, 2),
                "attempts": lesson_attempts[lesson_id]
            })

        difficulty_list.sort(key=lambda x: x["average_score"])

        return Response({
            "difficult_lessons": difficulty_list[:10]
        })


# ---------------------------------------------------
# GLOBAL MISPRONUNCIATION ANALYSIS
# ---------------------------------------------------

class GlobalWeakWordsAPIView(APIView):
    """
    Shows words most mispronounced across all students.
    Useful for teachers and curriculum designers.
    """

    def get(self, request):

        attempts = PronunciationAttempt.objects.all()

        word_counter = {}

        for attempt in attempts:

            words = attempt.mispronounced or []

            for entry in words:

                word = entry.get("word")

                if not word:
                    continue

                word_counter[word] = word_counter.get(word, 0) + 1

        sorted_words = sorted(
            word_counter.items(),
            key=lambda x: x[1],
            reverse=True
        )

        result = [
            {
                "word": word,
                "mistake_count": count
            }
            for word, count in sorted_words[:30]
        ]

        return Response({
            "global_problem_words": result
        })