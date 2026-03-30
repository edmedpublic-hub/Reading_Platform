from django.urls import path, include
from django.shortcuts import redirect
from . import views

app_name = "reading"

# Helper view for root redirect
def home_redirect(request):
    return redirect('reading:book_list')

urlpatterns = [
    # Root URL - redirect to book list
    path("", home_redirect, name="home"),
    
    # Template URLs
    path("books/", views.book_list, name="book_list"),
    path("books/<int:book_id>/units/", views.unit_list, name="unit_list"),
    path("units/<int:unit_id>/lessons/", views.lesson_list, name="lesson_list"),
    path("lessons/<int:pk>/", views.lesson_detail, name="lesson_detail"),
    
    # Process endpoints
    path("lessons/<int:lesson_id>/process/", views.process_recording, name="process_recording"),
    path("attempts/<int:attempt_id>/", views.get_attempt_detail, name="attempt_detail"),
    
    # API endpoints (delegate to api_urls.py)
    path("api/", include(("reading.api_urls", "reading_api"), namespace="reading_api")),
    
    # Analytics Dashboard
    path('analytics/', views.analytics_dashboard, name='analytics_dashboard'),
]