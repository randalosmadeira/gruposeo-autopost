import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

type HealthStatus = 'checking' | 'online' | 'offline';

export function useBackendHealth(intervalMs = 30000) {
  const [status, setStatus] = useState<HealthStatus>('checking');
  const [latency, setLatency] = useState<number | null>(null);

  const check = useCallback(async () => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`,
        {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (res.ok) {
        setLatency(Date.now() - start);
        setStatus('online');
      } else {
        setStatus('offline');
        setLatency(null);
      }
    } catch {
      setStatus('offline');
      setLatency(null);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);

  return { status, latency, recheck: check };
}
