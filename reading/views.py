# reading/views.py

from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from rest_framework import generics
from .models import ReadingLesson, PronunciationAttempt
from .serializers import ReadingLessonSerializer
import speech_recognition as sr
import os
import json

from django.shortcuts import render
from .models import Book

def book_list(request):
    books = Book.objects.all()
    return render(request, "reading/book_list.html", {"books": books})

# reading/views.py
from .models import Book, Unit

def unit_list(request, book_id):
    book = get_object_or_404(Book, pk=book_id)
    units = book.units.all()
    return render(request, "reading/unit_list.html", {"book": book, "units": units})

# reading/views.py
from .models import Unit

def lesson_list(request, unit_id):
    unit = get_object_or_404(Unit, pk=unit_id)
    lessons = unit.lessons.all()
    return render(request, "reading/lesson_list.html", {"unit": unit, "lessons": lessons})


# --- API views (unchanged) ---
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


# --- Template views (updated) ---
#def reading_home(request):
    """
    Render the lesson list page.
    Lessons are passed to the template for optional server-side rendering.
    """
    #lessons = ReadingLesson.objects.all().only("id", "title")
    #return render(request, "reading/reading.html", {"lessons": lessons})


def lesson_detail(request, pk):
    """
    Render a single lesson detail page.
    Now also fetches previous attempts for this user and lesson.
    """
    lesson = get_object_or_404(ReadingLesson, pk=pk)
    
    # Get user's previous attempts for this lesson if logged in
    previous_attempts = None
    if request.user.is_authenticated:
        previous_attempts = PronunciationAttempt.objects.filter(
            user=request.user,
            lesson=lesson
        ).order_by('-created_at')[:5]  # Last 5 attempts
    
    context = {
        "lesson": lesson,
        "previous_attempts": previous_attempts
    }
    return render(request, "reading/lesson_detail.html", context)


# --- NEW: Recording processing view ---
@login_required
@csrf_exempt
def process_recording(request, lesson_id):
    """
    Handle audio upload, transcribe using Google's free Web Speech API,
    analyze pronunciation, and save attempt to database.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    # Get the lesson
    lesson = get_object_or_404(ReadingLesson, pk=lesson_id)
    
    # Get audio file from request
    audio_file = request.FILES.get('audio')
    if not audio_file:
        return JsonResponse({'error': 'No audio file provided'}, status=400)
    
    # Create temp directory if it doesn't exist
    temp_dir = '/tmp/reading_app'
    os.makedirs(temp_dir, exist_ok=True)
    
    # Save audio temporarily
    temp_path = f'{temp_dir}/recording_{request.user.id}_{lesson_id}.wav'
    with open(temp_path, 'wb+') as destination:
        for chunk in audio_file.chunks():
            destination.write(chunk)
    
    # Transcribe using speech_recognition (free)
    recognizer = sr.Recognizer()
    
    try:
        with sr.AudioFile(temp_path) as source:
            # Adjust for ambient noise (helps accuracy)
            recognizer.adjust_for_ambient_noise(source, duration=0.5)
            audio = recognizer.record(source)
        
        # Use Google's free Web Speech API
        spoken_text = recognizer.recognize_google(audio)
        
        # Calculate feedback
        feedback = analyze_pronunciation(lesson.content, spoken_text)
        
        # Save attempt to database
        attempt = PronunciationAttempt.objects.create(
            user=request.user,
            lesson=lesson,
            expected=lesson.content,
            spoken=spoken_text,
            score=feedback['score'],
            mispronounced=feedback['problem_words'],
            feedback=feedback['summary']
        )
        
        # Clean up temp file
        os.remove(temp_path)
        
        return JsonResponse({
            'success': True,
            'attempt_id': attempt.id,
            'feedback': feedback
        })
        
    except sr.UnknownValueError:
        # Clean up temp file even on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return JsonResponse({
            'error': 'Could not understand audio. Please speak clearly and try again.'
        }, status=400)
        
    except sr.RequestError as e:
        # Clean up temp file even on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return JsonResponse({
            'error': f'Speech service error. Please check your internet connection.'
        }, status=500)
        
    except Exception as e:
        # Clean up temp file even on error
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return JsonResponse({
            'error': f'An unexpected error occurred: {str(e)}'
        }, status=500)


def analyze_pronunciation(expected, spoken):
    """
    Compare expected vs spoken text and generate feedback.
    Returns score, problem words, and human-readable summary.
    """
    # Convert to lowercase and split into words
    expected_words = expected.lower().split()
    spoken_words = spoken.lower().split()
    
    problem_words = []
    correct_count = 0
    
    # Compare word by word
    for i, expected_word in enumerate(expected_words):
        if i < len(spoken_words):
            if expected_word == spoken_words[i]:
                correct_count += 1
            else:
                problem_words.append({
                    'word': expected_word,
                    'heard': spoken_words[i],
                    'position': i
                })
        else:
            # Missing words at the end
            problem_words.append({
                'word': expected_word,
                'heard': '[missing]',
                'position': i
            })
    
    # Calculate score (percentage of correctly spoken words)
    score = (correct_count / len(expected_words)) * 100 if expected_words else 0
    
    # Generate human-readable summary based on score
    if score >= 90:
        summary = "🌟 Excellent! Your reading was very accurate. Keep up the great work!"
    elif score >= 75:
        summary = "👍 Good job! A few words need practice. Focus on the problem words below."
    elif score >= 50:
        summary = "📝 Keep practicing! You're making progress. Pay special attention to these words:"
    else:
        summary = "🎯 Let's try again. Listen to the text and practice these words slowly:"
    
    # Add specific word tips if there are problem words
    if problem_words:
        problem_word_list = [p['word'] for p in problem_words[:5]]
        if len(problem_words) > 5:
            summary += f" Focus on: {', '.join(problem_word_list)} and {len(problem_words)-5} more."
        else:
            summary += f" Practice: {', '.join(problem_word_list)}"
    
    # For perfect score, give extra encouragement
    if score == 100:
        summary = "🏆 PERFECT! You read every word correctly. You're a star reader!"
    
    return {
        'score': round(score, 2),
        'problem_words': problem_words,
        'summary': summary
    }


# --- NEW: View to fetch previous attempt details ---
@login_required
def get_attempt_detail(request, attempt_id):
    """
    Return details of a specific pronunciation attempt.
    Useful for reviewing past performances.
    """
    attempt = get_object_or_404(
        PronunciationAttempt, 
        id=attempt_id, 
        user=request.user
    )
    
    return JsonResponse({
        'id': attempt.id,
        'score': attempt.score,
        'spoken': attempt.spoken,
        'expected': attempt.expected,
        'mispronounced': attempt.mispronounced,
        'feedback': attempt.feedback,
        'created_at': attempt.created_at.strftime('%B %d, %Y at %I:%M %p')
    })