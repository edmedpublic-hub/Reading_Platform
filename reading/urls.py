from django.urls import path, include
from . import views
from .api_urls import urlpatterns as api_urlpatterns

app_name = "reading"

urlpatterns = [
    # Template views
    path("", views.reading_home, name="home"),
    path("<int:pk>/", views.reading_detail, name="detail"),

    # API routes
    path("api/", include((api_urlpatterns, "reading_api"))),
]