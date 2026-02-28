from django.contrib import admin
from django.urls import path, include
from django.shortcuts import render
from . import views



def home(request):
    return render(request, "index.html")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("", home, name="home"),
    path("reading/", include(("reading.urls", "reading"), namespace="reading")),
    path('accounts/check-auth/', views.check_auth, name='check_auth'),
]