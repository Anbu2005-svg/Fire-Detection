"""
Flask backend server for Fire Detection
Serves the frontend and provides API endpoints for fire detection
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from ultralytics import YOLO
import base64
import io
import cv2
import numpy as np
from PIL import Image
import os
import sys

# Optional: allow downloading the model from a URL if it's not present in the repo
# Set the MODEL_URL environment variable to a direct download link (eg. an S3 presigned URL)
import requests

def ensure_model(model_path: str):
    """Ensure model file exists. If not and MODEL_URL is set, download it."""
    if os.path.exists(model_path):
        print(f"Model already present: {model_path}")
        return True

    model_url = os.getenv("MODEL_URL")
    if not model_url:
        print(f"Model file not found ({model_path}) and MODEL_URL not set. Skipping download.")
        return False

    try:
        print(f"Downloading model from MODEL_URL: {model_url} -> {model_path}")
        with requests.get(model_url, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(model_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        print("Model download complete.")
        return True
    except Exception as e:
        print(f"Failed to download model from MODEL_URL: {e}")
        return False


# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Load YOLOv8 model
MODEL_PATH = os.getenv('MODEL_PATH', 'best.pt')
# Try to ensure model is present (will download if MODEL_URL provided)
ensure_model(MODEL_PATH)

try:
    model = YOLO(MODEL_PATH)
    print(f"✓ Model loaded: {MODEL_PATH}")
except Exception as e:
    print(f"✗ Error loading model: {e}")
    model = None

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size


# Routes
@app.route('/')
def index():
    """Serve the main page"""
    return send_from_directory('.', 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS)"""
    return send_from_directory('.', filename)


@app.route('/api/detect', methods=['POST'])
def detect():
    """
    API endpoint for fire detection
    Expects: JSON with base64 encoded image
    Returns: JSON with annotated image and detection results
    """
    if model is None:
        return jsonify({'success': False, 'error': 'Model not loaded'}), 500

    try:
        # Get image data from request
        data = request.json
        
        if not data or 'image' not in data:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        # Decode base64 image
        image_data = data['image']
        
        # Handle different base64 formats
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # Convert to numpy array
        image_array = np.array(image)
        
        # Run detection
        results = model.predict(image_array, conf=0.25)
        
        # Draw results
        annotated_image = results[0].plot()
        
        # Convert back to PIL Image
        annotated_pil = Image.fromarray(annotated_image)
        
        # Encode to base64
        buffer = io.BytesIO()
        annotated_pil.save(buffer, format='PNG')
        buffer.seek(0)
        result_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # Extract detection info
        detections = results[0].boxes
        num_detections = len(detections) if detections is not None else 0
        
        # Calculate confidence
        confidences = []
        if detections is not None and len(detections) > 0:
            confidences = detections.conf.cpu().numpy().tolist()
        
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        
        return jsonify({
            'success': True,
            'image': f'data:image/png;base64,{result_base64}',
            'detections': num_detections,
            'confidence': round(avg_confidence * 100, 2),
            'fire_detected': num_detections > 0
        })

    except Exception as e:
        print(f"Error during detection: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
