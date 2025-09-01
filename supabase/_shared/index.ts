/**
 * Shared Utilities for Supabase Edge Functions
 * Export all utility modules for easy importing
 */

// Configuration
export * from "./config.ts";

// Logging
export * from "./logging.ts";

// Database utilities
export * from "./database.ts";

// Notification services
export * from "./notifications.ts";

// Re-export commonly used functions with shorter names for convenience
export { 
  getSupabaseClient as getClient,
  BatchOperations as Batch,
  DatabaseHelpers as DB,
  dbHelpers as db
} from "./database.ts";

export { 
  notificationService as notifications,
  PushNotificationService,
  EmailService,
  WhatsAppService
} from "./notifications.ts";

export {
  writeLog as log,
  writeErrorLog as logError,
  createLogger,
  LOG_LEVELS
} from "./logging.ts";