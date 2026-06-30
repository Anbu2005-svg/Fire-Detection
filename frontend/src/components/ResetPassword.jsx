import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { authRequired, isConfigured, updatePassword } = useAuth();
  const navigate = useNavigate();
  const configurationMissing = authRequired && !isConfigured;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

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
      await updatePassword(password);
      navigate('/');
    } catch (submissionError) {
      setError(submissionError.message || 'Password update failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="section-kicker">Account recovery</span>
          <h2>Choose a new password</h2>
          <p>Enter a new password for your EmberWatch account.</p>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="resetPassword">New password</label>
            <input
              id="resetPassword"
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
            <label htmlFor="resetPasswordConfirm">Confirm new password</label>
            <input
              id="resetPasswordConfirm"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button className="button button-primary auth-submit" type="submit" disabled={loading || configurationMissing}>
            {loading ? 'Updating password...' : 'Update password'}
          </button>
        </form>
        {configurationMissing && (
          <div className="auth-error">
            Supabase is not configured yet. Add the frontend environment values before updating passwords.
          </div>
        )}
      </div>
    </div>
  );
}
