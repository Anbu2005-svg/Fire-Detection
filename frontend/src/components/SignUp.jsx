import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Validate password strength beyond just length.
 * Returns an error message or null if valid.
 */
function validatePasswordStrength(password) {
  if (password.length < 8) return 'Use at least 8 characters for the password.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  return null;
}

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { authRequired, isConfigured, signup } = useAuth();
  const configurationMissing = authRequired && !isConfigured;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await signup(email, password);
      setMessage('Account created. Check your email if confirmation is enabled.');
    } catch (submissionError) {
      setError(submissionError.message || 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="section-kicker">Operator access</span>
          <h2>Create an account</h2>
          <p>Register an operator account for protected deployments.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="signupEmail">Email address</label>
            <input
              id="signupEmail"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="signupPassword">Password</label>
            <input
              id="signupPassword"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <small className="password-hint">
              Minimum 8 characters with at least one uppercase letter, one lowercase letter, and one number.
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="button button-primary auth-submit" type="submit" disabled={loading || configurationMissing}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        {configurationMissing && (
          <div className="auth-error">
            Supabase is not configured yet. Add the frontend environment values before creating accounts.
          </div>
        )}

        <div className="auth-footer">
          <Link to="/login" className="back-link">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
