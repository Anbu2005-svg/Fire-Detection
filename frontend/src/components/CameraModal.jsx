import { useEffect } from 'react';

export default function CameraModal({
  isOpen,
  stream,
  videoRef,
  isLive,
  liveResult,
  onCapture,
  onToggleLive,
  onClose,
}) {
  // Attach stream to video element when it renders
  useEffect(() => {
    if (isOpen && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error("Auto-play prevented:", e));
    }
  }, [isOpen, stream, videoRef]);
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  const fireDetected = liveResult ? Boolean(liveResult.fire_detected) : false;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cameraTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <span className="section-kicker">Live feed</span>
            <h2 id="cameraTitle">Camera</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close camera" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7.8 6.4 4.2 4.2 4.2-4.2 1.4 1.4-4.2 4.2 4.2 4.2-1.4 1.4-4.2-4.2-4.2 4.2-1.4-1.4 4.2-4.2-4.2-4.2 1.4-1.4Z" />
            </svg>
          </button>
        </div>

        <div className="camera-stage-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ display: isLive && liveResult ? 'none' : 'block' }}
          />

          {isLive && liveResult && liveResult.image && (
            <img src={liveResult.image} alt="Live annotated detection" />
          )}

          {isLive && liveResult && (
            <div className={`camera-live-stats ${fireDetected ? 'alert' : ''}`}>
              <div className="live-stat-item">
                Detections: <strong>{liveResult.detections ?? 0}</strong>
              </div>
              <div className="live-stat-item">
                Confidence: <strong>{Number(liveResult.confidence || 0).toFixed(1)}%</strong>
              </div>
              <div className="live-stat-item">
                Latency: <strong>{liveResult.inference_ms ? `${Math.round(liveResult.inference_ms)} ms` : '--'}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="camera-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={onCapture}
            disabled={isLive}
          >
            Capture scene
          </button>
          <button className="button button-accent" type="button" onClick={onToggleLive}>
            {isLive ? 'Stop Live Detection' : 'Start Live Detection'}
          </button>
          <button className="button button-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
