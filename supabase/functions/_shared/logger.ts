/**
 * Structured logging helper for edge functions.
 * Generates request_id, logs function_name + user_id without exposing tokens.
 * Includes duration thresholds for performance monitoring.
 */

export interface LogContext {
  function_name: string;
  request_id: string;
  user_id?: string;
}

/** Duration thresholds (ms) for performance alerts */
export const DURATION_THRESHOLDS = {
  /** Requests slower than this are logged as "slow" */
  SLOW: 3000,
  /** Requests slower than this are logged as "very_slow" */
  VERY_SLOW: 10000,
  /** Requests slower than this are logged as "critical" */
  CRITICAL: 30000,
};

export function createRequestId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

export function createLogger(functionName: string, requestId: string) {
  const base = { function_name: functionName, request_id: requestId };

  return {
    context: base as LogContext,

    setUserId(userId: string) {
      (this.context as LogContext).user_id = userId;
    },

    info(message: string, extra?: Record<string, unknown>) {
      console.log(JSON.stringify({ level: "info", ...this.context, message, ...extra }));
    },

    warn(message: string, extra?: Record<string, unknown>) {
      console.warn(JSON.stringify({ level: "warn", ...this.context, message, ...extra }));
    },

    error(message: string, extra?: Record<string, unknown>) {
      console.error(JSON.stringify({ level: "error", ...this.context, message, ...extra }));
    },

    /** Log request start */
    requestStart(method: string, path?: string) {
      this.info("request_start", { method, path });
    },

    /** Log successful auth */
    authSuccess(userId: string) {
      this.setUserId(userId);
      this.info("auth_success");
    },

    /** Log auth failure */
    authFailure(reason: string) {
      this.warn("auth_failure", { reason });
    },

    /** 
     * Log request completion with performance classification.
     * Emits warnings for slow requests.
     */
    requestEnd(status: number, durationMs?: number) {
      const extra: Record<string, unknown> = { status, duration_ms: durationMs };
      
      if (durationMs !== undefined) {
        if (durationMs >= DURATION_THRESHOLDS.CRITICAL) {
          extra.performance = "critical";
          this.error("request_end_critical", extra);
        } else if (durationMs >= DURATION_THRESHOLDS.VERY_SLOW) {
          extra.performance = "very_slow";
          this.warn("request_end_very_slow", extra);
        } else if (durationMs >= DURATION_THRESHOLDS.SLOW) {
          extra.performance = "slow";
          this.warn("request_end_slow", extra);
        } else {
          extra.performance = "normal";
          this.info("request_end", extra);
        }
      } else {
        this.info("request_end", extra);
      }
    },
  };
}

