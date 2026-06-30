import { authRequired, isConfigured, supabase } from '../supabaseClient';

export async function getAccessToken() {
  if (!authRequired || !isConfigured || !supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function authHeaders() {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function authFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...(await authHeaders()),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Fetch a protected resource as a blob and return an object URL.
 * Use this instead of putting access tokens in URL query parameters
 * to avoid leaking credentials in browser history, logs, and Referer headers.
 */
export async function authFetchBlobUrl(url) {
  const response = await authFetch(url);
  if (!response.ok) return url; // Fallback to raw URL for non-protected resources
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
