import { useCallback, useEffect, useState } from 'react';
import { authFetch, authFetchBlobUrl } from '../utils/apiClient';

/**
 * Fetch protected image URLs as blob object URLs so that
 * access tokens are never exposed in query parameters.
 */
async function withProtectedImageUrls(items) {
  return Promise.all(
    (items || []).map(async (item) => ({
      ...item,
      image_url: await authFetchBlobUrl(item.image_url),
    }))
  );
}

export function useDetectionHistory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await authFetch('/api/history?limit=24');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'History request failed');
      setItems(await withProtectedImageUrls(data.items));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const removeItem = useCallback(async (itemId) => {
    const response = await authFetch(`/api/history/${itemId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not delete the history item.');
    setItems((current) => {
      const removed = current.find((item) => item.id === itemId);
      // Revoke the blob URL to free memory
      if (removed?.image_url?.startsWith('blob:')) {
        URL.revokeObjectURL(removed.image_url);
      }
      return current.filter((item) => item.id !== itemId);
    });
  }, []);

  const clearHistory = useCallback(async () => {
    const response = await authFetch('/api/history', { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not clear detection history.');
    setItems((current) => {
      // Revoke all blob URLs to free memory
      current.forEach((item) => {
        if (item.image_url?.startsWith('blob:')) {
          URL.revokeObjectURL(item.image_url);
        }
      });
      return [];
    });
  }, []);

  return { items, loading, refresh, removeItem, clearHistory };
}
