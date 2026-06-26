export default function DetectionSettings({ confidence, onConfidenceChange }) {
  return (
    <div className="settings-card">
      <div className="settings-header">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="settings-icon">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
        <span>Detection Settings</span>
      </div>
      <div className="settings-body">
        <div className="setting-row">
          <label htmlFor="confThreshold">Sensitivity (Confidence Threshold)</label>
          <div className="slider-container">
            <input
              type="range"
              id="confThreshold"
              min="0.05"
              max="0.90"
              step="0.05"
              value={confidence}
              onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
            />
            <span className="conf-value">{confidence.toFixed(2)}</span>
          </div>
          <span className="setting-desc">
            Lower threshold = more sensitive (detects smaller/faint fires, but may increase false alarms).
          </span>
        </div>
        <div className="model-setting-note">
          <span>Model input</span>
          <strong>640 x 640 ONNX</strong>
          <small>The exported model uses a fixed resolution for consistent performance.</small>
        </div>
      </div>
    </div>
  );
}
