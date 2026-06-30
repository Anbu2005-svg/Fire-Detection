import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000; // 1 minute lockout

/**
 * Sanitize Supabase error messages to avoid leaking internal details
 * (table names, constraint names, service URLs) to the UI.
 */
function sanitizeAuthError(message) {
  if (!message) return 'Authentication failed. Please try again.';
  const lower = message.toLowerCase();
  if (lower.includes('invalid login')) return 'Invalid email or password.';
  if (lower.includes('email not confirmed')) return 'Please confirm your email address before signing in.';
  if (lower.includes('too many requests') || lower.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  if (lower.includes('network') || lower.includes('fetch')) return 'Network error. Check your connection and try again.';
  if (lower.includes('not configured')) return message; // Keep configuration messages
  // Catch-all: avoid exposing raw Supabase internals
  return 'Sign in failed. Please check your credentials and try again.';
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { authRequired, isConfigured, login } = useAuth();
  const navigate = useNavigate();
  const configurationMissing = authRequired && !isConfigured;

  // Brute-force lockout state
  const failedAttemptsRef = useRef(0);
  const lockoutUntilRef = useRef(0);
  const lockoutTimerRef = useRef(null);
  const [isLockedOut, setIsLockedOut] = useState(false);

  useEffect(() => {
    return () => {
      if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Check lockout
    const now = Date.now();
    if (now < lockoutUntilRef.current) {
      const remainingSeconds = Math.ceil((lockoutUntilRef.current - now) / 1000);
      setError(`Too many failed attempts. Please wait ${remainingSeconds} seconds.`);
      return;
    }

    setLoading(true);
    
    try {
      await login(email, password);
      failedAttemptsRef.current = 0; // Reset on success
      navigate('/'); // Redirect to dashboard
    } catch (err) {
      failedAttemptsRef.current += 1;
      if (failedAttemptsRef.current >= MAX_LOGIN_ATTEMPTS) {
        lockoutUntilRef.current = Date.now() + LOCKOUT_DURATION_MS;
        failedAttemptsRef.current = 0;
        setIsLockedOut(true);
        if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
        lockoutTimerRef.current = setTimeout(() => {
          setIsLockedOut(false);
          lockoutUntilRef.current = 0;
        }, LOCKOUT_DURATION_MS);
        setError(`Too many failed attempts. Please wait ${LOCKOUT_DURATION_MS / 1000} seconds before trying again.`);
      } else {
        setError(sanitizeAuthError(err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="section-kicker">Welcome back</span>
          <h2>Sign in to EmberWatch</h2>
          <p>Access your AI incident screening dashboard</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@example.com"
            />
          </div>

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          <button 
            type="submit" 
            className="button button-primary auth-submit"
            disabled={loading || configurationMissing || isLockedOut}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {configurationMissing && (
          <div className="auth-error">
            Supabase is not configured yet. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
            to the root `.env` file, then rebuild the frontend.
          </div>
        )}

        <div className="auth-footer">
          <span>New to EmberWatch?</span>{' '}
          <Link to="/signup" className="back-link">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
