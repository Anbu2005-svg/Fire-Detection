import { useCallback, useEffect, useState } from 'react';

export function useDetectionHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/history?limit=24');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'History request failed');
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const removeItem = useCallback(async (itemId) => {
    const response = await fetch(`/api/history/${itemId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete the history item.');
    setItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const clearHistory = useCallback(async () => {
    const response = await fetch('/api/history', { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not clear detection history.');
    setItems([]);
  }, []);

  return { items, loading, refresh, removeItem, clearHistory };
}
