# reading/views.py

from django.shortcuts import render, get_object_or_404
from rest_framework import generics
from .models import ReadingLesson
from .serializers import ReadingLessonSerializer


# --- API views ---
class ReadingLessonListView(generics.ListAPIView):
    """
    API endpoint: return a list of all reading lessons.
    """
    queryset = ReadingLesson.objects.all()
    serializer_class = ReadingLessonSerializer


class ReadingLessonDetailView(generics.RetrieveAPIView):
    """
    API endpoint: return details of a single reading lesson by ID.
    """
    queryset = ReadingLesson.objects.all()
    serializer_class = ReadingLessonSerializer
    lookup_field = "pk"


# --- Template views ---
def reading_home(request):
    """
    Render the lesson list page.
    Lessons are passed to the template for optional server-side rendering.
    """
    lessons = ReadingLesson.objects.all().only("id", "title")  # optimize query
    return render(request, "reading/reading.html", {"lessons": lessons})


def reading_detail(request, pk):
    """
    Render a single lesson detail page.
    """
    lesson = get_object_or_404(ReadingLesson, pk=pk)
    return render(request, "reading/reading_detail.html", {"lesson": lesson})