# 🔥 Fire Detection Website - Deployment Guide

## Overview
This guide will help you deploy the Fire Detection system as a website with a professional frontend interface.

---

## Option 1: Using Flask Backend (Recommended for Deployment)

### Prerequisites
- Python 3.8+
- pip (Python package manager)
- Git

### Setup Instructions

#### 1. Install Dependencies
```bash
# Install all required packages
pip install -r requirements_frontend.txt
```

#### 2. Verify Model File
Ensure `best.pt` is in the repository root directory:
```bash
ls -la best.pt
```

#### 3. Run Flask Server
```bash
python app_flask.py
```

The server will start on `http://localhost:5000`

#### 4. Access the Website
Open your browser and navigate to:
```
http://localhost:5000
```

---

## Option 2: Using Gradio Server (For Quick Testing)

### Run Original Gradio App
```bash
python app.py
```

**Note:** Update `script.js` API_URL if using this approach:
```javascript
const API_URL = 'http://localhost:7860'; // Gradio default port
```

---

## Project Structure
```
Fire-Detection/
├── index.html              # Main frontend HTML
├── styles.css              # CSS styling
├── script.js               # JavaScript functionality
├── app.py                  # Original Gradio app
├── app_flask.py            # Flask backend server
├── best.pt                 # YOLOv8 model (pre-trained)
├── requirements.txt        # Original dependencies
├── requirements_frontend.txt # Frontend dependencies
└── DEPLOYMENT_GUIDE.md     # This file
```

---

## API Endpoints

### 1. Detect Fire
**Endpoint:** `POST /api/detect`

**Request:**
```json
{
  "image": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response:**
```json
{
  "success": true,
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "detections": 2,
  "confidence": 85.5,
  "fire_detected": true
}
```

### 2. Health Check
**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "model_loaded": true,
  "model_path": "best.pt"
}
```

### 3. API Info
**Endpoint:** `GET /api/info`

**Response:**
```json
{
  "name": "Fire Detection API",
  "version": "1.0.0",
  "description": "Real-time fire and smoke detection using YOLOv8",
  "model": "YOLOv8"
}
```

---

## Features

### Frontend Features ✨
- **Real-time Detection** - Analyze images instantly
- **Camera Integration** - Capture photos directly from webcam
- **Drag & Drop** - Easy image uploading
- **Results Visualization** - See detection with bounding boxes
- **Responsive Design** - Works on desktop, tablet, mobile
- **Dark Theme** - Modern, eye-friendly interface

### Backend Features ⚡
- **YOLOv8 Integration** - State-of-the-art object detection
- **CORS Support** - Frontend-backend communication
- **Base64 Image Handling** - Efficient image transmission
- **Confidence Scoring** - Detection reliability metrics
- **Error Handling** - Comprehensive error messages

---

## Deployment to Production

### Using Gunicorn (Recommended)
```bash
# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app_flask:app
```

### Using Docker
Create a `Dockerfile`:
```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements_frontend.txt .
RUN pip install -r requirements_frontend.txt

COPY . .

EXPOSE 5000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app_flask:app"]
```

Build and run:
```bash
docker build -t fire-detection .
docker run -p 5000:5000 fire-detection
```

### Using AWS, Azure, or Heroku
Each platform has specific deployment steps. General requirements:
1. Install dependencies during build
2. Expose port 5000
3. Ensure `best.pt` is included in deployment package
4. Set appropriate environment variables

---

## Troubleshooting

### Issue: Model not loading
```
✗ Error loading model: [Errno 2] No such file or directory: 'best.pt'
```
**Solution:** Ensure `best.pt` exists in the root directory

### Issue: CORS errors
```
Access to XMLHttpRequest blocked by CORS policy
```
**Solution:** The Flask server includes CORS. If issues persist, check `flask-cors` installation:
```bash
pip install flask-cors --upgrade
```

### Issue: Port already in use
```
Address already in use
```
**Solution:** Use a different port:
```bash
python app_flask.py  # Change port in app_flask.py
```

### Issue: Detection is slow
**Solution:** 
- Ensure GPU is available if supported by YOLOv8
- Reduce image size before uploading
- Use confident filter (adjust `conf=0.25` in `app_flask.py`)

---

## Performance Optimization

### Client-side
- Compress images before upload
- Limit to reasonable image sizes

### Server-side
- Use GPU if available (CUDA)
- Implement caching for repeated detections
- Use async processing for multiple requests

### Network
- Enable gzip compression
- Use CDN for static assets
- Implement request batching

---

## Configuration

### Modify Detection Confidence
Edit `app_flask.py`, line with `model.predict()`:
```python
results = model.predict(image_array, conf=0.5)  # Increase for fewer false positives
```

### Change Server Port
Edit `app_flask.py`, last line:
```python
app.run(debug=True, host='0.0.0.0', port=8000)  # Change port to 8000
```

---

## Next Steps

1. **Deploy to Cloud** - Use AWS EC2, Azure App Service, or Heroku
2. **Add Authentication** - Protect API endpoints with API keys
3. **Enable HTTPS** - Use SSL certificates for production
4. **Monitor Performance** - Set up logging and analytics
5. **Scale Horizontally** - Use load balancing for multiple servers

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Flask and Gradio documentation
3. Check YOLOv8 official documentation
4. Open an issue on GitHub

---

## License
This project is licensed under Apache License 2.0 (same as original)

---

**Happy Fire Detection! 🔥🚒**