import { useState, useEffect, useCallback } from 'react';

const API_URL = '';

export function useHealthCheck() {
  const [modelAvailable, setModelAvailable] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Checking model');
  const [statusClass, setStatusClass] = useState('');

  const check = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const loaded = Boolean(data.model_loaded);
      setModelAvailable(loaded);
      setStatusLabel(loaded ? 'Model online' : 'Model unavailable');
      setStatusClass(loaded ? 'online' : 'offline');
    } catch {
      setModelAvailable(false);
      setStatusLabel('Server offline');
      setStatusClass('offline');
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(check, 0);
    return () => clearTimeout(timeoutId);
  }, [check]);

  return { modelAvailable, statusLabel, statusClass, recheckHealth: check };
}
