// Load environment variables safely
import { loadSync } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Explicitly load from supabase/.env
loadSync({
  envPath: new URL("../.env", import.meta.url).pathname,
  export: true, // makes vars available via Deno.env.get
  examplePath: undefined, // don't force .env.defaults check
});

/**
 * Helper function to get environment variables with a fallback
 */
function getEnv(key: string, defaultValue = ""): string {
  return Deno.env.get(key) ?? defaultValue;
}

/**
 * Database Collections
 */
export const COLLECTIONS = {
  FCM_TOKENS: "fcm_tokens",
  SCHOOLS: "schools",
  STUDENTS: "students",
  STAFF: "staff",
  USERS: "users",
  NOTIFICATIONS: "notifications",
  CHAT_MESSAGES: "chat_messages",
  BEHAVIOUR: "behaviour",
  BEHAVIOUR_TICKETS: "behaviour_tickets",
  STAFF_LEAVES: "staff_leaves",
  STUDENT_LEAVES: "student_leaves",
  VISITOR_LOGS: "visitor_logs",
  ANNOUNCEMENTS: "announcements",
  STUDENT_ATTENDANCE: "student_attendance",
  FEES: "fees",
  FEES_SETUP: "fees_setup",
  FEES_PAYMENT_MANAGER: "fees_payment_manager",
  BOOK_TRANSACTIONS: "book_transactions",
  SUBJECT_ALLOCATION: "subject_allocation",
  INSTITUTE_LEADS: "institute_leads",
  STUDENT_MONTHLY_ATTENDANCE_AGG: "student_monthly_attendance_agg",
};

/**
 * Aggregates (could be materialized views in Supabase)
 */
export const AGGREGATE_COLLECTIONS = {
  LIBRARY_AGG: "library_agg",
  FEES_AGG: "fees_agg",
  STUDENT_ATD_AGG: "student_atd_agg",
  EXAM_CLASS_WISE_SUB_AGG: "exam_class_wise_sub_agg",
};

/**
 * Function Config
 */
export const FUNCTION_CONFIG = {
  REGION: getEnv("FUNCTION_REGION", "us-east-1"),
  MEMORY: getEnv("FUNCTION_MEMORY", "256MB"),
  TIMEOUT_SECONDS: parseInt(getEnv("FUNCTION_TIMEOUT", "540"), 10),
};

/**
 * API Endpoints
 */
export const API_ENDPOINTS = {
  WHATSAPP_API: getEnv(
    "WHATSAPP_API_ENDPOINT",
    "https://graph.facebook.com/v18.0/117687654632531/messages",
  ),
  GOOGLE_MAPS_API: "https://maps.googleapis.com/maps/api",
};

/**
 * API Keys (optional → fallback empty if not provided)
 */
export const API_KEYS = {
  WHATSAPP_AUTH_TOKEN: getEnv("WHATSAPP_AUTH_TOKEN"),
  WHATSAPP_VERIFY_TOKEN: getEnv("WHATSAPP_VERIFY_TOKEN"),
  GOOGLE_MAPS_API_KEY: getEnv("GOOGLE_MAPS_API_KEY"),
  SENDGRID_API_KEY: getEnv("SENDGRID_API_KEY"),
  STRIPE_SECRET_KEY: getEnv("STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: getEnv("STRIPE_WEBHOOK_SECRET"),
  OPENAI_API_KEY: getEnv("OPENAI_API_KEY"),
};

/**
 * Email Config
 */
export const EMAIL_CONFIG = {
  FROM_EMAIL: getEnv("FROM_EMAIL", "noreply@zeffko.com"),
  FROM_NAME: getEnv("FROM_NAME", "Zeffko School Management"),
};

/**
 * Notifications
 */
export const NOTIFICATION_SETTINGS = {
  DEFAULT_SOUND: "default",
  DEFAULT_BADGE: 1,
  MAX_BATCH_SIZE: 500,
};

/**
 * Target Apps
 */
export const TARGET_APPS = {
  PARENTS: "parents",
  STAFF: "staff",
  INSTITUTE: "institute",
  ADMIN: "admin",
};

/**
 * Modules
 */
export const INSTITUTE_MODULES = {
  ANNOUNCEMENTS: "announcements",
  BEHAVIOUR_TRACKING: "behaviour_tracking",
  ATTENDANCE: "attendance",
  EXAMS: "exams",
  FEES: "fees",
  LIBRARY: "library",
};

export const PARENTS_MODULES = {
  ANNOUNCEMENTS: "announcements",
  BEHAVIOUR_TRACKING: "behaviour_tracking",
  ATTENDANCE: "attendance",
  EXAMS: "exams",
  FEES: "fees",
  CHAT: "chat",
  LEAVE_REQUESTS: "leave_requests",
};

/**
 * Log Levels
 */
export const LOG_LEVELS = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
  DEBUG: "debug",
};

/**
 * Supabase Config
 */
export const SUPABASE_CONFIG = {
  URL: getEnv("SUPABASE_URL"),
  SERVICE_ROLE_KEY: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  ANON_KEY: getEnv("SUPABASE_ANON_KEY"),
  WEBHOOK_SECRET: getEnv("SUPABASE_WEBHOOK_SECRET"),
  CRON_SECRET: getEnv("CRON_SECRET"),
  DATABASE_URL: getEnv("DATABASE_URL"),
};
