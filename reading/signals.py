from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from django.db import transaction

from .models import PronunciationAttempt, LessonProgress


@receiver(post_save, sender=PronunciationAttempt)
def update_lesson_progress(sender, instance, created, **kwargs):
    """
    Automatically update LessonProgress whenever a PronunciationAttempt is created.
    Uses database locking to avoid race conditions.
    """

    if not created:
        return

    user = instance.user
    lesson = instance.lesson

    if not user or not lesson:
        return

    with transaction.atomic():

        progress, created_progress = LessonProgress.objects.select_for_update().get_or_create(
            user=user,
            lesson=lesson,
        )

        # Update attempt count
        progress.total_attempts += 1

        now = timezone.now()

        # First attempt time
        if not progress.first_attempt_at:
            progress.first_attempt_at = now

        # Last attempt time
        progress.last_attempt_at = now

        # Best score logic
        if instance.score is not None:
            if progress.best_score is None:
                progress.best_score = instance.score
            else:
                progress.best_score = max(progress.best_score, instance.score)

        # Completion rule
        if progress.best_score is not None and progress.best_score >= 80:
            progress.is_completed = True

        progress.save()