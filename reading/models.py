# reading/models.py
from django.db import models
from django.conf import settings


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
        null=True,   # keep nullable for now to avoid migration issues
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
    expected = models.TextField()               # full lesson text
    spoken = models.TextField()                 # student's captured transcript
    score = models.FloatField(null=True, blank=True)  # percentage 0-100
    mispronounced = models.JSONField(default=list, blank=True)  # list of words flagged
    feedback = models.TextField(blank=True)     # human-friendly textual feedback
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["lesson", "created_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"Attempt {self.id} lesson={self.lesson_id} score={self.score}"
