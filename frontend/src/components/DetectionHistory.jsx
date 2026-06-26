function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function DetectionHistory({ items, loading, onDelete, onClear }) {
  const hazardCount = items.filter((item) => item.hazard_detected).length;

  return (
    <section className="history-section" aria-labelledby="historyTitle">
      <div className="section-heading-row">
        <div>
          <span className="section-kicker">Audit trail</span>
          <h2 id="historyTitle">Recent analyses</h2>
          <p>{items.length} stored scans, including {hazardCount} hazard events.</p>
        </div>
        {items.length > 0 && (
          <button className="button button-compact button-danger" type="button" onClick={onClear}>
            Clear history
          </button>
        )}
      </div>

      {loading ? (
        <div className="history-empty">Loading detection history...</div>
      ) : items.length === 0 ? (
        <div className="history-empty">
          <strong>No analyses recorded yet</strong>
          <span>Completed image and camera scans will appear here.</span>
        </div>
      ) : (
        <div className="history-grid">
          {items.map((item) => (
            <article className={`history-card ${item.hazard_detected ? 'hazard' : ''}`} key={item.id}>
              <a href={item.image_url} target="_blank" rel="noreferrer" className="history-image">
                <img src={item.image_url} alt={`Detection result from ${formatDate(item.created_at)}`} loading="lazy" />
                <span>{item.hazard_detected ? 'Hazard' : 'Clear'}</span>
              </a>
              <div className="history-body">
                <div className="history-meta">
                  <span>{item.source.replace('-', ' ')}</span>
                  <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
                </div>
                <strong>
                  {item.hazard_detected
                    ? `${item.detection_count} detection${item.detection_count === 1 ? '' : 's'}`
                    : 'No hazard detected'}
                </strong>
                <small>
                  {item.top_confidence.toFixed(1)}% confidence · {Math.round(item.processing_ms)} ms
                </small>
                <div className="history-actions">
                  <a className="text-action" href={item.image_url} download={`emberwatch-${item.id}.jpg`}>
                    Download
                  </a>
                  <button className="text-action danger" type="button" onClick={() => onDelete(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
