FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies required by OpenCV/ffmpeg and building some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    wget \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements_frontend.txt ./

RUN pip install --upgrade pip
RUN pip install -r requirements_frontend.txt

# Copy application code
COPY . .

# Default model path (can be overridden with MODEL_PATH env var)
ENV MODEL_PATH=best.pt

EXPOSE 5000

# Start the app with gunicorn
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app_flask:app"]
