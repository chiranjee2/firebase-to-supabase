/**
 * Notification Utilities for Supabase Edge Functions
 * Handles push notifications, email notifications, and WhatsApp messaging
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { COLLECTIONS, API_KEYS, NOTIFICATION_SETTINGS, SUPABASE_CONFIG } from "./config.ts";
import { writeLog, LOG_LEVELS } from "./logging.ts";

/**
 * Interface for notification data
 */
interface NotificationData {
  title: string;
  body: string;
  imageUrl?: string;
  sound?: string;
  parameterData?: Record<string, unknown>;
  initialPageName?: string;
  targetApp?: string;
}

/**
 * Interface for FCM token
 */
interface FCMToken {
  fcm_token: string;
  platform?: string;
  created_at?: string;
}

/**
 * Push Notification Service using FCM
 */
export class PushNotificationService {
  private supabase;
  
  constructor() {
    this.supabase = createClient(
      SUPABASE_CONFIG.URL,
      SUPABASE_CONFIG.SERVICE_ROLE_KEY
    );
  }

  /**
   * Send push notifications to multiple users
   */
  async sendToUsers(
    userIds: string[],
    notification: NotificationData,
    isChatNotification = false,
    functionName = "notification-service"
  ): Promise<void> {
    try {
      await writeLog(LOG_LEVELS.INFO, `Sending notifications to ${userIds.length} users`, functionName);

      const tokens = new Set<string>();
      
      // Collect FCM tokens from all users
      for (const userId of userIds) {
        try {
          const { data: userTokens, error } = await this.supabase
            .from(COLLECTIONS.FCM_TOKENS)
            .select('fcm_token')
            .eq('user_id', userId);

          if (error) {
            await writeLog(LOG_LEVELS.WARNING, `Error fetching tokens for user ${userId}`, functionName, { error: error.message });
            continue;
          }

          userTokens?.forEach((token: FCMToken) => {
            if (token.fcm_token) {
              tokens.add(token.fcm_token);
            }
          });

          // Save notification to database (unless it's a chat notification)
          if (!isChatNotification) {
            await this.saveNotificationToDatabase(userId, notification, functionName);
          }

        } catch (error) {
          await writeLog(LOG_LEVELS.ERROR, `Error processing user ${userId}`, functionName, { error });
        }
      }

      // Send push notifications via FCM
      if (tokens.size > 0) {
        await this.sendFCMNotifications(Array.from(tokens), notification, functionName);
      } else {
        await writeLog(LOG_LEVELS.WARNING, "No FCM tokens found for notification", functionName);
      }

    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, "Failed to send notifications", functionName, { error });
      throw error;
    }
  }

  /**
   * Save notification to database
   */
  private async saveNotificationToDatabase(
    userId: string, 
    notification: NotificationData, 
    functionName: string
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from(COLLECTIONS.NOTIFICATIONS)
        .insert({
          user_id: userId,
          title: notification.title,
          subtitle: notification.body,
          page_params: notification.parameterData || {},
          read: false,
          target_app: notification.targetApp,
          created_at: new Date().toISOString(),
        });

      if (error) {
        await writeLog(LOG_LEVELS.ERROR, `Failed to save notification for user ${userId}`, functionName, { error: error.message });
      }
    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, `Exception saving notification for user ${userId}`, functionName, { error });
    }
  }

  /**
   * Send FCM notifications using Firebase Cloud Messaging
   */
  private async sendFCMNotifications(
    tokens: string[], 
    notification: NotificationData,
    functionName: string
  ): Promise<void> {
    try {
      // Note: For FCM, you'll need to set up a service account key
      // or use Firebase Admin SDK via a separate service
      
      const fcmPayload = {
        notification: {
          title: notification.title,
          body: notification.body,
          image: notification.imageUrl,
          sound: notification.sound || NOTIFICATION_SETTINGS.DEFAULT_SOUND,
        },
        data: {
          initialPageName: notification.initialPageName || "",
          parameterData: JSON.stringify(notification.parameterData || {}),
          targetApp: notification.targetApp || "",
        },
        tokens: tokens.slice(0, 500), // FCM limit
      };

      // TODO: Implement FCM API call
      // For now, we'll use a webhook or external service
      const fcmWebhookUrl = Deno.env.get("FCM_WEBHOOK_URL");
      if (fcmWebhookUrl) {
        const response = await fetch(fcmWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("FCM_SERVER_KEY")}`,
          },
          body: JSON.stringify(fcmPayload),
        });

        if (!response.ok) {
          throw new Error(`FCM API error: ${response.status} ${response.statusText}`);
        }

        await writeLog(LOG_LEVELS.INFO, `FCM notifications sent to ${tokens.length} devices`, functionName);
      } else {
        await writeLog(LOG_LEVELS.WARNING, "FCM webhook not configured, notifications not sent", functionName);
      }

    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, "Failed to send FCM notifications", functionName, { error });
      throw error;
    }
  }
}

/**
 * Email Service using SendGrid
 */
export class EmailService {
  /**
   * Send email using SendGrid API
   */
  async sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    text?: string,
    functionName = "email-service"
  ): Promise<void> {
    try {
      const recipients = Array.isArray(to) ? to : [to];
      
      const payload = {
        personalizations: recipients.map(email => ({ to: [{ email }] })),
        from: {
          email: Deno.env.get("FROM_EMAIL") || "noreply@zeffko.com",
          name: Deno.env.get("FROM_NAME") || "Zeffko School Management",
        },
        subject,
        content: [
          { type: "text/html", value: html },
          ...(text ? [{ type: "text/plain", value: text }] : []),
        ],
      };

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEYS.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`SendGrid API error: ${response.status} ${error}`);
      }

      await writeLog(LOG_LEVELS.INFO, `Email sent to ${recipients.length} recipient(s)`, functionName);

    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, "Failed to send email", functionName, { error });
      throw error;
    }
  }
}

/**
 * WhatsApp Service using WhatsApp Business API
 */
export class WhatsAppService {
  /**
   * Send WhatsApp message
   */
  async sendMessage(
    to: string,
    message: string,
    functionName = "whatsapp-service"
  ): Promise<void> {
    try {
      const payload = {
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""), // Remove non-digits
        type: "text",
        text: { body: message },
      };

      const response = await fetch(Deno.env.get("WHATSAPP_API_ENDPOINT")!, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEYS.WHATSAPP_AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`WhatsApp API error: ${response.status} ${error}`);
      }

      await writeLog(LOG_LEVELS.INFO, `WhatsApp message sent to ${to}`, functionName);

    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, "Failed to send WhatsApp message", functionName, { error });
      throw error;
    }
  }
}

/**
 * Unified notification service
 */
export class NotificationService {
  private pushService = new PushNotificationService();
  private emailService = new EmailService();
  private whatsAppService = new WhatsAppService();

  /**
   * Send multi-channel notification
   */
  async sendNotification(
    userIds: string[],
    notification: NotificationData,
    options: {
      sendPush?: boolean;
      sendEmail?: boolean;
      sendWhatsApp?: boolean;
      emailTemplate?: { subject: string; html: string; text?: string };
      whatsAppMessage?: string;
    } = {},
    functionName = "notification-service"
  ): Promise<void> {
    const { sendPush = true, sendEmail = false, sendWhatsApp = false } = options;

    try {
      // Send push notifications
      if (sendPush) {
        await this.pushService.sendToUsers(userIds, notification, false, functionName);
      }

      // Send emails if configured
      if (sendEmail && options.emailTemplate) {
        // Get user emails from database
        const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.SERVICE_ROLE_KEY);
        const { data: users } = await supabase
          .from(COLLECTIONS.USERS)
          .select('email')
          .in('id', userIds);

        if (users?.length) {
          const emails = users.map(u => u.email).filter(Boolean);
          if (emails.length > 0) {
            await this.emailService.sendEmail(
              emails,
              options.emailTemplate.subject,
              options.emailTemplate.html,
              options.emailTemplate.text,
              functionName
            );
          }
        }
      }

      // Send WhatsApp messages if configured
      if (sendWhatsApp && options.whatsAppMessage) {
        // Get user phone numbers from database
        const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.SERVICE_ROLE_KEY);
        const { data: users } = await supabase
          .from(COLLECTIONS.USERS)
          .select('phone_number')
          .in('id', userIds);

        if (users?.length) {
          const phones = users.map(u => u.phone_number).filter(Boolean);
          for (const phone of phones) {
            try {
              await this.whatsAppService.sendMessage(phone, options.whatsAppMessage, functionName);
            } catch (error) {
              await writeLog(LOG_LEVELS.WARNING, `Failed to send WhatsApp to ${phone}`, functionName, { error });
            }
          }
        }
      }

    } catch (error) {
      await writeLog(LOG_LEVELS.ERROR, "Failed to send multi-channel notification", functionName, { error });
      throw error;
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();