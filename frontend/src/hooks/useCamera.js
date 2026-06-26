import { useState, useCallback, useRef } from 'react';

export function useCamera() {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);

  const MAX_IMAGE_EDGE = 1600;

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera capture is not supported in this browser.');
    }
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    setStream(mediaStream);
    setIsOpen(true);
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsOpen(false);
  }, [stream]);

  const captureFrame = useCallback(async (quality = 0.9) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return null;
    return new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }, []);

  return { isOpen, stream, videoRef, startCamera, stopCamera, captureFrame };
}
