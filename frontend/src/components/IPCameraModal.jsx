import { useState, useEffect, useCallback } from 'react';

export default function IPCameraModal({
  isOpen,
  onClose,
  confidence,
  onNotify,
}) {
  const [url, setUrl] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamUrl, setStreamUrl] = useState(null);

  const handleDisconnect = useCallback(() => {
    setIsStreaming(false);
    setStreamUrl(null);
  }, []);

  const handleClose = useCallback(() => {
    handleDisconnect();
    onClose();
  }, [handleDisconnect, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleClose]);

  // Prevent body scroll when modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleConnect = () => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return;
    if (!/^(https?|rtsps?):\/\//i.test(normalizedUrl)) {
      onNotify('Enter a valid HTTP, HTTPS, RTSP, or RTSPS camera URL.', 'error');
      return;
    }
    const apiUrl = `/api/stream?url=${encodeURIComponent(normalizedUrl)}&confidence=${confidence}`;
    setStreamUrl(apiUrl);
    setIsStreaming(true);
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ipCameraTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <span className="section-kicker">Network stream</span>
            <h2 id="ipCameraTitle">IP Camera</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close IP camera" onClick={handleClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7.8 6.4 4.2 4.2 4.2-4.2 1.4 1.4-4.2 4.2 4.2 4.2-1.4 1.4-4.2-4.2-4.2 4.2-1.4-1.4 4.2-4.2-4.2-4.2 1.4-1.4Z" />
            </svg>
          </button>
        </div>

        <div className="ip-camera-stage">
          {!isStreaming ? (
            <div className="ip-camera-form">
              <label htmlFor="ipCamUrl">
                IP Camera Stream URL
              </label>
              <input
                id="ipCamUrl"
                type="url"
                placeholder="e.g., rtsp://admin:12345@192.168.1.100:554/stream1"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p>
                Enter the RTSP or HTTP stream URL for your IP camera. The stream will be processed directly on this server for real-time detection.
              </p>
              <small>Use a restricted camera account because stream URLs can include credentials.</small>
            </div>
          ) : (
            <img 
              src={streamUrl} 
              alt="IP Camera Live Stream" 
              onError={() => {
                handleDisconnect();
                onNotify('Could not connect to the camera. Check its URL and network access.', 'error');
              }}
            />
          )}
        </div>

        <div className="camera-actions">
          {!isStreaming ? (
            <button
              className="button button-primary"
              type="button"
              onClick={handleConnect}
              disabled={!url}
            >
              Connect & Analyze
            </button>
          ) : (
            <button
              className="button button-accent"
              type="button"
              onClick={handleDisconnect}
            >
              Stop Stream
            </button>
          )}
          <button className="button button-secondary" type="button" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
