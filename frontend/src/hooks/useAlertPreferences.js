import { useCallback, useRef, useState } from 'react';

const STORAGE_KEY = 'emberwatch-alert-preferences';

function loadPreferences() {
  try {
    return {
      browser: false,
      sound: true,
      cooldownSeconds: 30,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
    };
  } catch {
    return { browser: false, sound: true, cooldownSeconds: 30 };
  }
}

function playAlertTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.28, context.currentTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.7);
  oscillator.addEventListener('ended', () => context.close());
}

export function useAlertPreferences(showToast) {
  const [preferences, setPreferencesState] = useState(loadPreferences);
  const lastAlertRef = useRef(0);

  const savePreferences = useCallback((nextPreferences) => {
    setPreferencesState(nextPreferences);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPreferences));
  }, []);

  const setSoundEnabled = useCallback((enabled) => {
    savePreferences({ ...preferences, sound: enabled });
  }, [preferences, savePreferences]);

  const setBrowserEnabled = useCallback(async (enabled) => {
    if (!enabled) {
      savePreferences({ ...preferences, browser: false });
      return;
    }
    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported here.', 'error');
      return;
    }

    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    savePreferences({ ...preferences, browser: granted });
    showToast(
      granted ? 'Browser hazard notifications enabled.' : 'Notification permission was not granted.',
      granted ? 'success' : 'warning'
    );
  }, [preferences, savePreferences, showToast]);

  const setCooldownSeconds = useCallback((cooldownSeconds) => {
    savePreferences({ ...preferences, cooldownSeconds });
  }, [preferences, savePreferences]);

  const notifyHazard = useCallback((result, source = 'scene') => {
    if (!result?.fire_detected) return false;

    const now = Date.now();
    if (now - lastAlertRef.current < preferences.cooldownSeconds * 1000) return false;
    lastAlertRef.current = now;

    if (preferences.sound) playAlertTone();
    if (preferences.browser && Notification.permission === 'granted') {
      const labels = Object.keys(result.labels || {}).join(' and ') || 'fire or smoke';
      new Notification('EmberWatch hazard alert', {
        body: `${labels} detected from ${source} at ${Number(result.confidence || 0).toFixed(1)}% confidence.`,
        icon: '/favicon.svg',
        tag: 'emberwatch-hazard',
      });
    }
    return true;
  }, [preferences]);

  const testAlert = useCallback(() => {
    lastAlertRef.current = 0;
    notifyHazard(
      { fire_detected: true, confidence: 92.4, labels: { fire: 1 } },
      'notification test'
    );
    showToast('Test alert triggered.', 'warning');
  }, [notifyHazard, showToast]);

  return {
    preferences,
    setSoundEnabled,
    setBrowserEnabled,
    setCooldownSeconds,
    notifyHazard,
    testAlert,
  };
}
