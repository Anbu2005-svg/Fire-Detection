import { useState, useRef, useCallback, useEffect } from 'react';
import { authFetch } from '../utils/apiClient';

const API_URL = '';

export function useLiveDetection() {
  const [isLive, setIsLive] = useState(false);
  const [liveResult, setLiveResult] = useState(null);
  const runningRef = useRef(false);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const startLive = useCallback((captureFrameFn, confidence, onResult) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsLive(true);

    const loop = async () => {
      if (!runningRef.current) return;

      const frame = await captureFrameFn(0.80);
      if (!frame) {
        if (runningRef.current) setTimeout(loop, 100);
        return;
      }

      const formData = new FormData();
      formData.append('image', frame, 'frame.jpg');
      if (confidence != null) formData.append('confidence', String(confidence));
      formData.append('source', 'live-camera');

      try {
        abortRef.current = new AbortController();
        const res = await authFetch(`${API_URL}/api/detect`, {
          method: 'POST',
          body: formData,
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error('Live detection request failed');
        const data = await res.json();
        if (data.success && runningRef.current) {
          setLiveResult(data);
          onResult?.(data);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.warn('Live detection frame failed:', error);
        }
      }

      if (runningRef.current) timerRef.current = setTimeout(loop, 250);
    };

    loop();
  }, []);

  const stopLive = useCallback(() => {
    runningRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    timerRef.current = null;
    abortRef.current = null;
    setIsLive(false);
    setLiveResult(null);
  }, []);

  useEffect(() => stopLive, [stopLive]);

  return { isLive, liveResult, startLive, stopLive };
}
