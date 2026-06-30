import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isConfigured = supabaseUrl.startsWith('http') && supabaseAnonKey.length > 10;
const authRequired = import.meta.env.VITE_AUTH_REQUIRED === 'true';

if (authRequired && !isConfigured) {
  console.warn(
    'Supabase auth is required but not configured. Please update your .env file with:\n' +
    '  VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  );
}

// Create client only if properly configured, otherwise use a dummy URL
// that will fail gracefully on auth calls
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export { authRequired, isConfigured };
