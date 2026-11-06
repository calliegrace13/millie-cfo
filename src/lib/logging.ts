/**
 * Conditional logging utility for production safety.
 * Only logs errors in development mode to prevent information leakage.
 */

export const logError = (context: string, error: unknown): void => {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
  // In production, errors are silently handled
  // Add monitoring service integration here if needed (e.g., Sentry, LogRocket)
};

export const logWarn = (context: string, message: string): void => {
  if (import.meta.env.DEV) {
    console.warn(`[${context}]`, message);
  }
};

export const logInfo = (context: string, message: string): void => {
  if (import.meta.env.DEV) {
    console.info(`[${context}]`, message);
  }
};
