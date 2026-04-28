/**
 * WhatsappHealthBadge.tsx
 * Badge compacto que muestra el estado del bridge de WhatsApp.
 * Hace polling cada 60s. Completamente autónomo — no depende de App.tsx.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface HealthState {
  connected: boolean;
  error?: boolean;
  lastChecked: Date | null;
}

interface Props {
  className?: string;
  pollIntervalMs?: number;
}

export function WhatsappHealthBadge({ className = '', pollIntervalMs = 60_000 }: Props) {
  const [health, setHealth] = useState<HealthState>({ connected: false, lastChecked: null });
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/whatsapp/health', { signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      setHealth({ connected: !!data.connected, lastChecked: new Date() });
    } catch {
      setHealth({ connected: false, error: true, lastChecked: new Date() });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, pollIntervalMs);
    return () => clearInterval(interval);
  }, [check, pollIntervalMs]);

  if (checking && !health.lastChecked) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 ${className}`}>
        <Loader2 size={11} className="animate-spin" />
        WhatsApp
      </span>
    );
  }

  if (health.connected) {
    return (
      <span
        title={`WhatsApp conectado · ${health.lastChecked?.toLocaleTimeString()}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 ${className}`}
      >
        <Wifi size={11} />
        WhatsApp
      </span>
    );
  }

  return (
    <span
      title={`Bridge desconectado · ${health.lastChecked?.toLocaleTimeString()}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600 ${className}`}
    >
      <WifiOff size={11} />
      Desconectado
    </span>
  );
}
