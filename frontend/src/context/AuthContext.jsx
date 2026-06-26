import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isConfigured } from '../supabaseClient';

const AuthContext = createContext({});
const authRequired = import.meta.env.VITE_AUTH_REQUIRED === 'true';

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(isConfigured);

  useEffect(() => {
    if (!isConfigured || !supabase) return undefined;

    // Get active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    if (!isConfigured || !supabase) {
      throw new Error('Supabase is not configured. Please add your project URL and Anon Key to the .env file.');
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signup = async (email, password) => {
    if (!isConfigured || !supabase) {
      throw new Error('Supabase is not configured. Add the project URL and anon key to the frontend .env file.');
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    if (!supabase || !session) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email) => {
    if (!isConfigured || !supabase) {
      throw new Error('Supabase is not configured. Please add your project URL and Anon Key to the .env file.');
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    if (error) throw error;
  };

  const updatePassword = async (password) => {
    if (!isConfigured || !supabase) {
      throw new Error('Supabase is not configured.');
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        login,
        signup,
        logout,
        resetPassword,
        updatePassword,
        loading,
        isConfigured,
        authRequired,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  return useContext(AuthContext);
};
