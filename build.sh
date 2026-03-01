#!/usr/bin/env bash

set -o errexit
set -o pipefail
set -o nounset

# 1. Install system dependencies for PyAudio
apt-get update && apt-get install -y portaudio19-dev

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Collect static files
python manage.py collectstatic --noinput

# 4. Apply migrations
python manage.py migrate