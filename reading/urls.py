from django.urls import path, include
from . import views

app_name = "reading"

urlpatterns = [
    # Template URLs
    path("books/", views.book_list, name="book_list"),
    path("books/<int:book_id>/units/", views.unit_list, name="unit_list"),
    path("units/<int:unit_id>/lessons/", views.lesson_list, name="lesson_list"),
    path("lessons/<int:pk>/", views.lesson_detail, name="lesson_detail"),
    
    # Process endpoints
    path("lessons/<int:lesson_id>/process/", views.process_recording, name="process_recording"),
    path("attempts/<int:attempt_id>/", views.get_attempt_detail, name="attempt_detail"),
    
    # API endpoints (delegate to api_urls.py)
    path("api/", include("reading.api_urls")),
]