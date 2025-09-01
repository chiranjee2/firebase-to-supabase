/**
 * Logging Utility for Supabase Edge Functions
 * Deno-compatible version with console logging and optional external logging
 */

import { SUPABASE_CONFIG } from "./config.ts";

/**
 * Log levels for different types of log entries
 */
export const LOG_LEVELS = {
  DEBUG: "DEBUG",
  INFO: "INFO", 
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
} as const;

export type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];

/**
 * Log entry structure
 */
interface LogEntry {
  level: LogLevel;
  message: string;
  functionName: string;
  timestamp: string;
  error?: Error;
  additionalData?: Record<string, unknown>;
}

/**
 * Formats log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const { level, message, functionName, timestamp, additionalData } = entry;
  const extra = additionalData ? ` | Data: ${JSON.stringify(additionalData)}` : "";
  return `[${timestamp}] ${level} [${functionName}]: ${message}${extra}`;
}

/**
 * Writes an error log entry with additional context
 */
export async function writeErrorLog(
  error: Error, 
  functionName: string, 
  additionalData: Record<string, unknown> = {}
): Promise<void> {
  const entry: LogEntry = {
    level: LOG_LEVELS.ERROR,
    message: error.message,
    functionName,
    timestamp: new Date().toISOString(),
    error,
    additionalData,
  };

  // Always log to console for Deno
  console.error(formatLogEntry(entry));
  if (error.stack) {
    console.error("Stack trace:", error.stack);
  }

  // TODO: Implement external logging service if needed (e.g., Sentry, LogDNA, etc.)
  try {
    await logToExternalService(entry);
  } catch (loggingError) {
    console.error("Failed to write to external logging service:", loggingError);
  }
}

/**
 * Writes a general log entry
 */
export async function writeLog(
  level: LogLevel, 
  message: string, 
  functionName: string, 
  additionalData: Record<string, unknown> = {}
): Promise<void> {
  const entry: LogEntry = {
    level,
    message,
    functionName,
    timestamp: new Date().toISOString(),
    additionalData,
  };

  // Log to console based on level
  const formatted = formatLogEntry(entry);
  switch (level) {
    case LOG_LEVELS.ERROR:
    case LOG_LEVELS.CRITICAL:
      console.error(formatted);
      break;
    case LOG_LEVELS.WARNING:
      console.warn(formatted);
      break;
    case LOG_LEVELS.INFO:
      console.info(formatted);
      break;
    case LOG_LEVELS.DEBUG:
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }

  // TODO: Send to external logging service if configured
  try {
    await logToExternalService(entry);
  } catch (loggingError) {
    console.error("Failed to write to external logging service:", loggingError);
  }
}

/**
 * Optional external logging service integration
 * Replace with your preferred logging service (Sentry, LogDNA, etc.)
 */
async function logToExternalService(entry: LogEntry): Promise<void> {
  // Example: Send to a webhook or external logging API
  const externalLogUrl = Deno.env.get("EXTERNAL_LOG_URL");
  
  if (!externalLogUrl) {
    return; // No external logging configured
  }

  try {
    await fetch(externalLogUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("EXTERNAL_LOG_TOKEN") || ""}`,
      },
      body: JSON.stringify(entry),
    });
  } catch (error) {
    // Don't throw - external logging is optional
    console.warn("External logging failed:", error);
  }
}

/**
 * Create a logger instance for a specific function
 */
export function createLogger(functionName: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => 
      writeLog(LOG_LEVELS.DEBUG, message, functionName, data),
    info: (message: string, data?: Record<string, unknown>) => 
      writeLog(LOG_LEVELS.INFO, message, functionName, data),
    warning: (message: string, data?: Record<string, unknown>) => 
      writeLog(LOG_LEVELS.WARNING, message, functionName, data),
    error: (error: Error | string, data?: Record<string, unknown>) => {
      if (error instanceof Error) {
        return writeErrorLog(error, functionName, data);
      } else {
        return writeLog(LOG_LEVELS.ERROR, error, functionName, data);
      }
    },
    critical: (message: string, data?: Record<string, unknown>) => 
      writeLog(LOG_LEVELS.CRITICAL, message, functionName, data),
  };
}