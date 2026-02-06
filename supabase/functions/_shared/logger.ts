/**
 * Structured logging helper for edge functions.
 * Generates request_id, logs function_name + user_id without exposing tokens.
 */

export interface LogContext {
  function_name: string;
  request_id: string;
  user_id?: string;
}

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

    /** Log request completion */
    requestEnd(status: number, durationMs?: number) {
      this.info("request_end", { status, duration_ms: durationMs });
    },
  };
}
