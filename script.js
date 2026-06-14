// Configuration
const API_URL = 'http://localhost:5000'; // Flask backend port
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const imageWrapper = document.getElementById('imageWrapper');
const previewImage = document.getElementById('previewImage');
const noImage = document.getElementById('noImage');
const removeBtn = document.getElementById('removeBtn');
const detectBtn = document.getElementById('detectBtn');
const cameraBtn = document.getElementById('cameraBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const resultsSection = document.getElementById('resultsSection');
const resultImage = document.getElementById('resultImage');
const detectionStatus = document.getElementById('detectionStatus');
const detectionConfidence = document.getElementById('detectionConfidence');
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const captureBtn = document.getElementById('captureBtn');
const cancelCameraBtn = document.getElementById('cancelCameraBtn');
const closeCamera = document.getElementById('closeCamera');

let selectedImageData = null;
let mediaStream = null;

// Event Listeners - Upload Area
uploadArea.addEventListener('click', () => imageInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleImageSelect(files[0]);
    }
});

imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImageSelect(e.target.files[0]);
    }
});

// Handle Image Selection
function handleImageSelect(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showAlert('Please select a valid image file', 'error');
        return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        showAlert(`File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`, 'error');
        return;
    }

    // Read file
    const reader = new FileReader();
    reader.onload = (e) => {
        selectedImageData = e.target.result;
        previewImage.src = selectedImageData;
        imageWrapper.style.display = 'block';
        noImage.style.display = 'none';
        detectBtn.disabled = false;
        resultsSection.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// Remove Image
removeBtn.addEventListener('click', () => {
    selectedImageData = null;
    previewImage.src = '';
    imageWrapper.style.display = 'none';
    noImage.style.display = 'block';
    detectBtn.disabled = true;
    resultsSection.style.display = 'none';
    imageInput.value = '';
});

// Detect Objects
detectBtn.addEventListener('click', async () => {
    if (!selectedImageData) return;

    loadingSpinner.style.display = 'block';
    resultsSection.style.display = 'none';
    detectBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/api/detect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: selectedImageData
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        displayResults(data);
    } catch (error) {
        console.error('Detection error:', error);
        showAlert('Error during detection. Make sure the backend is running on port 5000.', 'error');
    } finally {
        loadingSpinner.style.display = 'none';
        detectBtn.disabled = false;
    }
});

// Display Results
function displayResults(data) {
    if (data.success) {
        resultImage.src = data.image;
        
        // Update detection info
        if (data.fire_detected) {
            detectionStatus.textContent = '🔥 Fire/Smoke Detected';
            detectionStatus.style.color = '#f44336';
        } else {
            detectionStatus.textContent = '✓ No Fire/Smoke Detected';
            detectionStatus.style.color = '#4caf50';
        }
        
        detectionConfidence.textContent = `${data.confidence}%`;
        resultsSection.style.display = 'block';
        
        // Scroll to results
        setTimeout(() => {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        showAlert('Error: ' + (data.error || 'Unknown error'), 'error');
    }
}

// Camera Functions
cameraBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', capturePhoto);
cancelCameraBtn.addEventListener('click', stopCamera);
closeCamera.addEventListener('click', stopCamera);

async function startCamera() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        cameraVideo.srcObject = mediaStream;
        cameraModal.style.display = 'flex';
    } catch (error) {
        console.error('Camera error:', error);
        showAlert('Unable to access camera. Please check permissions.', 'error');
    }
}

function capturePhoto() {
    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0);

    // Convert canvas to data URL
    const imageData = canvas.toDataURL('image/jpeg');
    selectedImageData = imageData;

    // Update preview
    previewImage.src = imageData;
    imageWrapper.style.display = 'block';
    noImage.style.display = 'none';
    detectBtn.disabled = false;

    stopCamera();
    showAlert('Photo captured successfully!', 'success');
}

function stopCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    cameraVideo.srcObject = null;
    cameraModal.style.display = 'none';
}

// Alert Function
function showAlert(message, type = 'info') {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        background-color: ${getAlertColor(type)};
        color: white;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    alertDiv.textContent = message;

    document.body.appendChild(alertDiv);

    // Remove after 3 seconds
    setTimeout(() => {
        alertDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
}

function getAlertColor(type) {
    const colors = {
        'success': '#4caf50',
        'error': '#f44336',
        'warning': '#ff9800',
        'info': '#2196f3'
    };
    return colors[type] || colors['info'];
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize
console.log('🔥 Fire Detection Frontend Loaded');
console.log(`API Server expected at: ${API_URL}`);