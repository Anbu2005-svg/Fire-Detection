export default function Toast({ toasts }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
