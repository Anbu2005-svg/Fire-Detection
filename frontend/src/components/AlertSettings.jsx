export default function AlertSettings({
  preferences,
  onBrowserChange,
  onSoundChange,
  onCooldownChange,
  onTest,
}) {
  return (
    <section className="alert-settings" aria-labelledby="alertSettingsTitle">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">Incident response</span>
          <h2 id="alertSettingsTitle">Alert preferences</h2>
        </div>
        <button className="button button-compact button-secondary" type="button" onClick={onTest}>
          Test alert
        </button>
      </div>

      <div className="alert-option-grid">
        <label className="toggle-card">
          <span>
            <strong>Browser notification</strong>
            <small>Show a system notification when a hazard is detected.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.browser}
            onChange={(event) => onBrowserChange(event.target.checked)}
          />
          <span className="toggle-control" aria-hidden="true"></span>
        </label>

        <label className="toggle-card">
          <span>
            <strong>Audible alert</strong>
            <small>Play a short local warning tone for new hazard events.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.sound}
            onChange={(event) => onSoundChange(event.target.checked)}
          />
          <span className="toggle-control" aria-hidden="true"></span>
        </label>

        <label className="cooldown-card" htmlFor="alertCooldown">
          <span>
            <strong>Repeat cooldown</strong>
            <small>Prevents repeated live-camera alerts from becoming noisy.</small>
          </span>
          <select
            id="alertCooldown"
            value={preferences.cooldownSeconds}
            onChange={(event) => onCooldownChange(Number(event.target.value))}
          >
            <option value={10}>10 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
          </select>
        </label>
      </div>
    </section>
  );
}
