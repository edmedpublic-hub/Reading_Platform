from django.contrib import admin
from .models import BookCategory, Book, Unit, ReadingLesson


class UnitInline(admin.TabularInline):
    model = Unit
    extra = 1
    fields = ("title", "order")
    ordering = ("order",)


class LessonInline(admin.TabularInline):
    model = ReadingLesson
    extra = 1
    fields = ("title", "order", "content")
    ordering = ("order",)


@admin.register(BookCategory)
class BookCategoryAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)
    ordering = ("name",)


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "order")
    list_filter = ("category",)
    search_fields = ("title",)
    ordering = ("category", "order")
    inlines = [UnitInline]


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("title", "book", "order")
    list_filter = ("book",)
    search_fields = ("title",)
    ordering = ("book", "order")
    inlines = [LessonInline]


@admin.register(ReadingLesson)
class ReadingLessonAdmin(admin.ModelAdmin):
    list_display = ("title", "unit", "order", "created_at", "updated_at")
    list_filter = ("unit",)
    search_fields = ("title", "content")
    ordering = ("unit", "order")