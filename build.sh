#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install Python dependencies from your updated requirements.txt
pip install -r requirements.txt

# 2. Collect static files (Required for CSS/JS to show up on the web)
python manage.py collectstatic --no-input

# 3. Apply database migrations to SQLite
python manage.py migrate