export default function ResultsPanel({ isDetecting, result, onDownload }) {
  // Loading state
  if (isDetecting) {
    return (
      <aside className="results-panel" aria-live="polite">
        <div className="loading-state">
          <div className="loader" aria-hidden="true"></div>
          <h3>Inspecting the scene</h3>
          <p>Running object detection and preparing the annotated result.</p>
        </div>
      </aside>
    );
  }

  // Result state
  if (result) {
    const fireDetected = Boolean(result.fire_detected);
    const confidence = Number(result.confidence || 0);

    return (
      <aside className="results-panel" aria-live="polite">
        <div className="result-content">
          <div className="result-header">
            <div>
              <span className="section-kicker">Analysis complete</span>
              <h3>{fireDetected ? 'Potential hazard detected' : 'No hazard detected'}</h3>
            </div>
            <span className={`result-badge ${fireDetected ? 'alert' : ''}`}>
              {fireDetected ? 'Attention' : 'Clear'}
            </span>
          </div>

          <div className="result-image-wrap">
            <img src={result.image} alt="Annotated detection result" />
          </div>

          <div className="metric-grid">
            <div className="metric">
              <span>Detections</span>
              <strong>{result.detections ?? 0}</strong>
            </div>
            <div className="metric">
              <span>Top confidence</span>
              <strong>{confidence.toFixed(1)}%</strong>
            </div>
            <div className="metric">
              <span>Inference</span>
              <strong>{result.inference_ms ? `${Math.round(result.inference_ms)} ms` : '--'}</strong>
            </div>
          </div>

          <div className="result-details">
            <div>
              <span>Detected classes</span>
              <strong>
                {Object.entries(result.labels || {}).length
                  ? Object.entries(result.labels).map(([label, count]) => `${label} (${count})`).join(', ')
                  : 'None'}
              </strong>
            </div>
            <div>
              <span>Total processing</span>
              <strong>{result.processing_ms ? `${Math.round(result.processing_ms)} ms` : '--'}</strong>
            </div>
          </div>

          <button className="button button-secondary result-download" type="button" onClick={onDownload}>
            Download annotated evidence
          </button>
        </div>
      </aside>
    );
  }

  // Placeholder state
  return (
    <aside className="results-panel" aria-live="polite">
      <div className="result-placeholder">
        <span className="result-orbit" aria-hidden="true">
          <span className="result-orbit-dot"></span>
        </span>
        <h3>Awaiting analysis</h3>
        <p>Detection status, confidence, and the annotated scene will appear here.</p>
      </div>
    </aside>
  );
}
