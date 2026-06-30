import { useState, useCallback } from 'react';
import { authFetch } from '../utils/apiClient';

const API_URL = '';
const REQUEST_TIMEOUT_MS = 90_000;

export function useDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState(null);

  const runDetection = useCallback(async (imageFile, confidence, source = 'upload') => {
    setIsDetecting(true);
    setResult(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const formData = new FormData();
    formData.append('image', imageFile, imageFile.name || 'scene.jpg');
    if (confidence != null) formData.append('confidence', String(confidence));
    formData.append('source', source);

    try {
      const response = await authFetch(`${API_URL}/api/detect`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Detection request failed (${response.status})`);
      }

      setResult(data);
      return data;
    } catch (error) {
      const message =
        error.name === 'AbortError'
          ? 'Analysis timed out. Try a smaller image or check the server.'
          : error.message || 'Detection failed. Check that the server is running.';
      throw new Error(message, { cause: error });
    } finally {
      clearTimeout(timeoutId);
      setIsDetecting(false);
    }
  }, []);

  const clearResult = useCallback(() => setResult(null), []);

  return { isDetecting, result, runDetection, clearResult };
}
