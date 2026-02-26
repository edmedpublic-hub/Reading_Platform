from rest_framework import serializers
from .models import ReadingLesson, PronunciationAttempt


class ReadingLessonSerializer(serializers.ModelSerializer):
    """
    Serializer for ReadingLesson model.
    Provides lesson metadata and plain text content.
    """
    class Meta:
        model = ReadingLesson
        fields = [
            "id",
            "title",
            "content",     # plain text content
            "unit",
            "order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PronunciationAttemptSerializer(serializers.ModelSerializer):
    """
    Serializer for PronunciationAttempt model.
    Records user attempts for pronunciation feedback.
    """
    class Meta:
        model = PronunciationAttempt
        fields = [
            "id",
            "lesson",        # ForeignKey to ReadingLesson
            "user",          # If you track which user attempted
            "spoken",   # The transcript captured
            "score",         # Numeric score
            "feedback",      # Textual feedback
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]