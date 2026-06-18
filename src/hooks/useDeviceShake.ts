import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';

// ─── Tuning Defaults ──────────────────────────────────────────────────────────
//
// Shake detection works on the *delta vector* between consecutive accelerometer
// samples. At rest the delta ≈ 0g (gravity is constant, so it cancels out).
// Casual walking produces small, low-frequency deltas (~0.2–0.6g per sample).
// A deliberate hand-shake produces sharp, oscillating deltas (~1.2g+).
//
// To reject single bumps (e.g. setting the phone down, a bag jostle) we require
// MULTIPLE spikes within a short rolling window — a true shake is oscillatory,
// a bump is a single impulse.

const DEFAULTS = {
  /** Per-sample delta-vector magnitude (g) above which a sample is a "spike". */
  threshold: 1.2,
  /** Number of spikes required inside `windowMs` to count as a deliberate shake. */
  requiredSpikes: 2,
  /** Rolling window over which spikes are counted. */
  windowMs: 600,
  /** Minimum gap between two recognised shakes (debounce). */
  cooldownMs: 1500,
  /** Accelerometer sampling interval. */
  updateIntervalMs: 60,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseDeviceShakeOptions {
  /** Invoked once per recognised deliberate shake. */
  onShake: () => void;
  /** When false, the accelerometer subscription is torn down entirely. */
  enabled?: boolean;
  threshold?: number;
  requiredSpikes?: number;
  windowMs?: number;
  cooldownMs?: number;
  updateIntervalMs?: number;
  /** Fire a Success notification haptic automatically on a recognised shake. */
  haptics?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Listens to the device accelerometer and invokes `onShake` when a sharp,
 * deliberate shake is detected — filtering out casual walking vibration and
 * single bumps.
 */
export function useDeviceShake(options: UseDeviceShakeOptions): void {
  const {
    enabled = true,
    threshold = DEFAULTS.threshold,
    requiredSpikes = DEFAULTS.requiredSpikes,
    windowMs = DEFAULTS.windowMs,
    cooldownMs = DEFAULTS.cooldownMs,
    updateIntervalMs = DEFAULTS.updateIntervalMs,
    haptics = true,
  } = options;

  // Keep the latest callback in a ref so changing its identity never forces a
  // resubscribe (which would drop accumulated spike state mid-shake).
  const onShakeRef = useRef(options.onShake);
  onShakeRef.current = options.onShake;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let subscription: { remove: () => void } | null = null;

    // Per-subscription mutable state.
    let hasBaseline = false;
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    let spikeTimes: number[] = [];
    let lastShakeAt = 0;

    const handleSample = ({ x, y, z }: { x: number; y: number; z: number }) => {
      if (!hasBaseline) {
        lastX = x; lastY = y; lastZ = z;
        hasBaseline = true;
        return;
      }

      // Delta vector between this sample and the previous one.
      const dx = x - lastX;
      const dy = y - lastY;
      const dz = z - lastZ;
      lastX = x; lastY = y; lastZ = z;

      const deltaMag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (deltaMag < threshold) return;

      // Record the spike and prune any older than the rolling window.
      const now = Date.now();
      spikeTimes.push(now);
      spikeTimes = spikeTimes.filter((t) => now - t <= windowMs);

      if (spikeTimes.length < requiredSpikes) return;
      if (now - lastShakeAt < cooldownMs) return;

      // Recognised deliberate shake.
      lastShakeAt = now;
      spikeTimes = [];

      if (haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      onShakeRef.current();
    };

    Accelerometer.isAvailableAsync()
      .then((available) => {
        if (cancelled || !available) return;
        Accelerometer.setUpdateInterval(updateIntervalMs);
        subscription = Accelerometer.addListener(handleSample);
      })
      .catch(() => {/* sensor unavailable — silently no-op */});

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, threshold, requiredSpikes, windowMs, cooldownMs, updateIntervalMs, haptics]);
}
