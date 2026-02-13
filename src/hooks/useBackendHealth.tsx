import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

type HealthStatus = 'checking' | 'online' | 'offline' | 'degraded';

export function useBackendHealth(intervalMs = 30000) {
  const [status, setStatus] = useState<HealthStatus>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const consecutiveFailures = useRef(0);

  const check = useCallback(async () => {
    const start = Date.now();
    
    // Try up to 2 times with increasing timeout
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutMs = attempt === 0 ? 10000 : 15000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`,
          {
            headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (res.ok) {
          const elapsed = Date.now() - start;
          setLatency(elapsed);
          consecutiveFailures.current = 0;
          setStatus(elapsed > 5000 ? 'degraded' : 'online');
          return;
        }
      } catch {
        // Retry on first attempt
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }

    consecutiveFailures.current++;
    setLatency(null);
    setStatus(consecutiveFailures.current >= 3 ? 'offline' : 'degraded');
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);

  return { status, latency, recheck: check };
}
