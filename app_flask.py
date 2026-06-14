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

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Load YOLOv8 model
MODEL_PATH = "best.pt"
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
        
        if 'image' not in data:
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


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'model_path': MODEL_PATH
    })


@app.route('/api/info', methods=['GET'])
def info():
    """Get API information"""
    return jsonify({
        'name': 'Fire Detection API',
        'version': '1.0.0',
        'description': 'Real-time fire and smoke detection using YOLOv8',
        'model': 'YOLOv8',
        'model_file': MODEL_PATH,
        'endpoints': {
            '/api/detect': 'POST - Detect fire in image',
            '/api/health': 'GET - Health check',
            '/api/info': 'GET - API information'
        }
    })


if __name__ == '__main__':
    print("🔥 Fire Detection Server Starting...")
    print("Starting Flask server on http://localhost:5000")
    print("Make sure best.pt is in the same directory")
    
    # Run the app
    app.run(debug=True, host='0.0.0.0', port=5000)