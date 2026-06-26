import { useState, useCallback } from 'react';
import Header from './components/Header';
import UploadArea from './components/UploadArea';
import ImagePreview from './components/ImagePreview';
import DetectionSettings from './components/DetectionSettings';
import ResultsPanel from './components/ResultsPanel';
import CameraModal from './components/CameraModal';
import IPCameraModal from './components/IPCameraModal';
import Toast from './components/Toast';
import AlertSettings from './components/AlertSettings';
import DetectionHistory from './components/DetectionHistory';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useDetection } from './hooks/useDetection';
import { useCamera } from './hooks/useCamera';
import { useLiveDetection } from './hooks/useLiveDetection';
import { useToast, optimizeImage } from './hooks/useToast';
import { useAlertPreferences } from './hooks/useAlertPreferences';
import { useDetectionHistory } from './hooks/useDetectionHistory';

import { useAuth } from './context/AuthContext';

export default function Dashboard() {
  const { modelAvailable, statusLabel, statusClass, recheckHealth } = useHealthCheck();
  const { isDetecting, result, runDetection, clearResult } = useDetection();
  const { isOpen: cameraOpen, stream, videoRef, startCamera, stopCamera, captureFrame } = useCamera();
  const { isLive, liveResult, startLive, stopLive } = useLiveDetection();
  const { toasts, showToast } = useToast();
  const alerts = useAlertPreferences(showToast);
  const history = useDetectionHistory();
  const { logout, user, authRequired } = useAuth();

  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedSource, setSelectedSource] = useState('upload');
  const [confidence, setConfidence] = useState(0.20);
  const [ipCameraOpen, setIpCameraOpen] = useState(false);

  // --- Image selection ---
  const handleImageSelected = useCallback(
    async (file) => {
      try {
        const optimized = await optimizeImage(file);
        setSelectedImage(optimized);
        setSelectedSource('upload');
        clearResult();
        if (optimized.size < file.size * 0.85) {
          const saved = Math.round((1 - optimized.size / file.size) * 100);
          showToast(`Image optimized by ${saved}% for faster analysis.`, 'success');
        }
      } catch (error) {
        showToast(error.message, 'error');
        setSelectedImage(null);
      }
    },
    [clearResult, showToast]
  );

  const handleRemoveImage = useCallback(() => {
    setSelectedImage(null);
    clearResult();
  }, [clearResult]);

  // --- Detection ---
  const handleDetect = useCallback(async () => {
    if (!selectedImage || !modelAvailable) return;
    try {
      const data = await runDetection(selectedImage, confidence, selectedSource);
      if (data.fire_detected) {
        alerts.notifyHazard(data, selectedSource.replace('-', ' '));
        showToast('Potential fire or smoke detected. Review the annotated evidence.', 'warning');
      } else {
        showToast('Analysis complete. No hazard was detected.', 'success');
      }
      await history.refresh();
    } catch (error) {
      showToast(error.message, 'error');
      recheckHealth();
    }
  }, [
    selectedImage,
    modelAvailable,
    runDetection,
    confidence,
    selectedSource,
    alerts,
    showToast,
    history,
    recheckHealth,
  ]);

  // --- Camera ---
  const handleOpenCamera = useCallback(async () => {
    try {
      await startCamera();
    } catch (error) {
      showToast(error.message || 'Camera access was unavailable.', 'error');
    }
  }, [startCamera, showToast]);

  const handleCloseCamera = useCallback(() => {
    stopLive();
    stopCamera();
  }, [stopLive, stopCamera]);

  const handleCapture = useCallback(async () => {
    const file = await captureFrame(0.9);
    if (!file) {
      showToast('The camera is still starting. Try again in a moment.', 'warning');
      return;
    }
    setSelectedImage(file);
    setSelectedSource('camera');
    clearResult();
    handleCloseCamera();
    showToast('Camera scene captured.', 'success');
  }, [captureFrame, clearResult, handleCloseCamera, showToast]);

  // --- Live detection ---
  const handleLiveResult = useCallback((data) => {
    if (alerts.notifyHazard(data, 'live camera')) {
      showToast('Live camera hazard detected.', 'warning');
    }
    if (data.history_item) history.refresh();
  }, [alerts, history, showToast]);

  const handleToggleLive = useCallback(() => {
    if (isLive) {
      stopLive();
    } else {
      startLive(captureFrame, confidence, handleLiveResult);
    }
  }, [isLive, stopLive, startLive, captureFrame, confidence, handleLiveResult]);

  const handleDownload = useCallback(() => {
    if (!result?.image) return;
    const link = document.createElement('a');
    link.href = result.image;
    link.download = `emberwatch-detection-${Date.now()}.jpg`;
    link.click();
  }, [result]);

  const handleDeleteHistory = useCallback(async (itemId) => {
    try {
      await history.removeItem(itemId);
      showToast('History item deleted.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }, [history, showToast]);

  const handleClearHistory = useCallback(async () => {
    if (!window.confirm('Delete all stored detection history and evidence images?')) return;
    try {
      await history.clearHistory();
      showToast('Detection history cleared.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }, [history, showToast]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      showToast(error.message || 'Sign out failed.', 'error');
    }
  }, [logout, showToast]);

  const totalHazards = history.items.filter((item) => item.hazard_detected).length;
  const latestAnalysis = history.items[0];

  return (
    <>
      <div className="app-shell">
        <Header
          statusLabel={statusLabel}
          statusClass={statusClass}
          user={user}
          authRequired={authRequired}
          onLogout={handleLogout}
        />

        <main>
          {/* Hero */}
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">AI incident screening</span>
              <h1>Detect visible fire and smoke before it spreads.</h1>
              <p>
                Upload a scene or capture one from your camera. EmberWatch runs a focused YOLO analysis and
                returns an annotated result in seconds.
              </p>
              <div className="hero-meta" aria-label="System capabilities">
                <span>ONNX Runtime</span>
                <span>Private by design</span>
                <span>JPG, PNG, WebP</span>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="radar-grid"></div>
              <div className="scan-frame">
                <span className="corner corner-tl"></span>
                <span className="corner corner-tr"></span>
                <span className="corner corner-bl"></span>
                <span className="corner corner-br"></span>
                <div className="scan-line"></div>
                <div className="signal-card">
                  <span className="signal-icon"></span>
                  <div>
                    <strong>Visual scan</strong>
                    <small>{modelAvailable ? 'Ready for analysis' : 'Waiting for server'}</small>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="overview-grid" aria-label="Detection overview">
            <article className="overview-card">
              <span>System status</span>
              <strong className={modelAvailable ? 'positive' : 'negative'}>
                {modelAvailable ? 'Operational' : 'Offline'}
              </strong>
              <small>{modelAvailable ? 'ONNX model ready' : 'Start the Flask server'}</small>
            </article>
            <article className="overview-card">
              <span>Stored analyses</span>
              <strong>{history.items.length}</strong>
              <small>Latest {history.items.length ? 'activity recorded' : 'scan pending'}</small>
            </article>
            <article className="overview-card">
              <span>Hazard events</span>
              <strong className={totalHazards ? 'negative' : 'positive'}>{totalHazards}</strong>
              <small>Within recent stored history</small>
            </article>
            <article className="overview-card">
              <span>Last processing time</span>
              <strong>{latestAnalysis ? `${Math.round(latestAnalysis.processing_ms)} ms` : '--'}</strong>
              <small>End-to-end server analysis</small>
            </article>
          </section>

          {/* Workspace */}
          <section className="workspace" aria-labelledby="workspaceTitle">
            <div className="workspace-heading">
              <div>
                <span className="section-kicker">Detection workspace</span>
                <h2 id="workspaceTitle">Analyze a scene</h2>
              </div>
              <span className="privacy-note">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2 4.5 5v5.3c0 4.8 3.1 9.3 7.5 10.7 4.4-1.4 7.5-5.9 7.5-10.7V5L12 2Zm3.5 8.1-4.2 4.2-2.4-2.4 1.1-1.1 1.3 1.3 3.1-3.1 1.1 1.1Z" />
                </svg>
                Processed on this server
              </span>
            </div>

            <div className="workspace-grid">
              <div>
                <UploadArea onImageSelected={handleImageSelected} />
                <ImagePreview imageFile={selectedImage} onRemove={handleRemoveImage} />
                <DetectionSettings
                  confidence={confidence}
                  onConfidenceChange={setConfidence}
                />

                <div className="action-row">
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={!selectedImage || !modelAvailable || isDetecting}
                    onClick={handleDetect}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9.5 3a6.5 6.5 0 1 0 3.9 11.7l5 5 1.4-1.4-5-5A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" />
                    </svg>
                    <span>{isDetecting ? 'Analyzing scene' : 'Run detection'}</span>
                  </button>
                  <button className="button button-secondary" type="button" onClick={handleOpenCamera}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 4-1.5 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4H9Zm3 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                    </svg>
                    Use camera
                  </button>
                  <button className="button button-secondary" type="button" onClick={() => setIpCameraOpen(true)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                    IP Camera
                  </button>
                </div>
              </div>

              <ResultsPanel isDetecting={isDetecting} result={result} onDownload={handleDownload} />
            </div>
          </section>

          <AlertSettings
            preferences={alerts.preferences}
            onBrowserChange={alerts.setBrowserEnabled}
            onSoundChange={alerts.setSoundEnabled}
            onCooldownChange={alerts.setCooldownSeconds}
            onTest={alerts.testAlert}
          />

          <DetectionHistory
            items={history.items}
            loading={history.loading}
            onDelete={handleDeleteHistory}
            onClear={handleClearHistory}
          />

          {/* Process steps */}
          <section className="process-section" aria-labelledby="processTitle">
            <div className="process-copy">
              <span className="section-kicker">Simple workflow</span>
              <h2 id="processTitle">From image to decision in three steps.</h2>
              <p>
                Designed for quick visual screening. Always confirm critical safety decisions with trained
                personnel and approved sensors.
              </p>
            </div>
            <ol className="process-list">
              <li>
                <span>01</span>
                <div>
                  <strong>Add a scene</strong>
                  <p>Upload an image or capture one with your camera.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Run AI analysis</strong>
                  <p>The model locates potential fire or smoke regions.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Review the evidence</strong>
                  <p>Inspect boxes, confidence, and detection count.</p>
                </div>
              </li>
            </ol>
          </section>
        </main>

        <footer>
          <span>EmberWatch Fire Detection AI</span>
          <span>Decision support, not a replacement for certified fire alarms.</span>
        </footer>
      </div>

      {/* Camera Modal */}
      <CameraModal
        isOpen={cameraOpen}
        stream={stream}
        videoRef={videoRef}
        isLive={isLive}
        liveResult={liveResult}
        onCapture={handleCapture}
        onToggleLive={handleToggleLive}
        onClose={handleCloseCamera}
      />

      <IPCameraModal
        isOpen={ipCameraOpen}
        onClose={() => setIpCameraOpen(false)}
        confidence={confidence}
        onNotify={showToast}
      />

      {/* Toast Notifications */}
      <Toast toasts={toasts} />
    </>
  );
}
