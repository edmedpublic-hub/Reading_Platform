# reading/models.py
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.db.models import F, Avg


class BookCategory(models.Model):
    name = models.CharField(max_length=255, unique=True)

    class Meta:
        verbose_name_plural = "Book Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Book(models.Model):
    title = models.CharField(max_length=255)
    category = models.ForeignKey(
        BookCategory,
        on_delete=models.CASCADE,
        related_name="books",
    )
    order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        ordering = ["order", "title"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "order"],
                name="unique_book_order_per_category",
            )
        ]

    def __str__(self):
        return self.title


class Unit(models.Model):
    title = models.CharField(max_length=255)
    book = models.ForeignKey(
        Book,
        on_delete=models.CASCADE,
        related_name="units",
    )
    order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        ordering = ["order", "title"]
        constraints = [
            models.UniqueConstraint(
                fields=["book", "order"],
                name="unique_unit_order_per_book",
            )
        ]

    def __str__(self):
        return f"{self.book.title} - {self.title}"


class ReadingLesson(models.Model):
    title = models.CharField(max_length=255)
    unit = models.ForeignKey(
        Unit,
        on_delete=models.CASCADE,
        related_name="lessons",
        null=True,
        blank=True,
    )
    content = models.TextField()
    order = models.PositiveIntegerField(default=0, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "title"]
        constraints = [
            models.UniqueConstraint(
                fields=["unit", "order"],
                name="unique_lesson_order_per_unit",
            )
        ]
        indexes = [
            models.Index(fields=["unit", "order"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.unit} - {self.title}" if self.unit else self.title


class PronunciationAttempt(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pron_attempts",
    )
    lesson = models.ForeignKey(
        ReadingLesson,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pron_attempts",
    )
    expected = models.TextField()
    spoken = models.TextField()
    score = models.FloatField(null=True, blank=True)
    mispronounced = models.JSONField(default=list, blank=True)
    feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["lesson", "created_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"Attempt {self.id} lesson={self.lesson_id} score={self.score}"


class LessonProgress(models.Model):
    """
    Tracks a student's progress on each reading lesson.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reading_progress",
    )
    lesson = models.ForeignKey(
        ReadingLesson,
        on_delete=models.CASCADE,
        related_name="progress_records",
    )
    total_attempts = models.PositiveIntegerField(default=0)
    best_score = models.FloatField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    first_attempt_at = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "lesson"],
                name="unique_progress_per_user_per_lesson",
            )
        ]
        indexes = [
            models.Index(fields=["user", "lesson"]),
            models.Index(fields=["user", "is_completed"]),
        ]

    def __str__(self):
        return f"{self.user} - {self.lesson}"


class WordAnalytics(models.Model):
    """Track performance on individual words"""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='word_analytics'
    )
    word = models.CharField(max_length=255)
    lesson = models.ForeignKey(
        ReadingLesson,
        on_delete=models.CASCADE,
        related_name='word_stats',
        null=True,
        blank=True
    )
    total_attempts = models.PositiveIntegerField(default=0)
    correct_attempts = models.PositiveIntegerField(default=0)
    last_attempt_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'word', 'lesson']
        ordering = ['-total_attempts']
        indexes = [
            models.Index(fields=['user', 'word']),
            models.Index(fields=['user', '-total_attempts']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.word}: {self.correct_attempts}/{self.total_attempts}"

    def success_rate(self):
        """Calculate success rate percentage"""
        if self.total_attempts == 0:
            return 0
        return round((self.correct_attempts / self.total_attempts) * 100, 1)


class UserAnalytics(models.Model):
    """Track user analytics over time"""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='analytics'
    )
    date = models.DateField(auto_now_add=True)
    total_attempts = models.PositiveIntegerField(default=0)
    avg_score = models.FloatField(default=0)
    lessons_completed = models.PositiveIntegerField(default=0)
    total_practice_time = models.PositiveIntegerField(default=0)
    words_practiced = models.JSONField(default=list)

    class Meta:
        unique_together = ['user', 'date']
        ordering = ['-date']
        indexes = [
            models.Index(fields=['user', 'date']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.date}"