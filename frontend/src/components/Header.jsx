export default function Header({ statusLabel, statusClass, user, authRequired, onLogout }) {
  return (
    <header className="topbar">
      <a className="brand" href="#" aria-label="EmberWatch home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img">
            <path d="M13.7 2.2c.3 2.4-.8 3.8-2 5.2-1 1.2-1.9 2.4-1.5 4.2.9-.5 1.5-1.4 1.7-2.5 2.3 1.7 3.8 4 3.8 6.7a3.8 3.8 0 0 1-7.6 0c0-1.1.4-2.2 1-3.1-2.4 1.2-4 3.6-4 6.3 0 .4 0 .8.1 1.2h13.5c.1-.5.2-1 .2-1.6 0-5-2.8-9.4-5.2-12.4Z" />
          </svg>
        </span>
        <span>
          <strong>EmberWatch</strong>
          <small>Visual safety intelligence</small>
        </span>
      </a>

      <div className="topbar-actions">
        <div className={`system-status ${statusClass}`} role="status" aria-live="polite">
          <span className="status-dot"></span>
          <span>{statusLabel}</span>
        </div>
        {user ? (
          <div className="account-menu">
            <span className="account-label" title={user.email}>{user.email}</span>
            <button className="button button-compact button-secondary" type="button" onClick={onLogout}>
              Sign out
            </button>
          </div>
        ) : (
          <span className="local-mode">{authRequired ? 'Sign-in required' : 'Local operator'}</span>
        )}
      </div>
    </header>
  );
}
