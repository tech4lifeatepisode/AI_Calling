import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const env = getEnv();
  if (!env.TOUR_BOOKING_EMAIL_ENABLED) {
    return null;
  }

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    logger.warn("Tour booking email enabled but SMTP settings are incomplete");
    return null;
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    });
  }

  return cachedTransporter;
}

export function isEmailConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.TOUR_BOOKING_EMAIL_ENABLED &&
      env.SMTP_HOST &&
      env.SMTP_USER &&
      env.SMTP_PASSWORD &&
      env.TOUR_BOOKING_NOTIFY_EMAIL
  );
}

export async function sendEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; error?: string }> {
  const env = getEnv();
  const transporter = getTransporter();

  if (!transporter) {
    return { success: false, error: "Email is not configured" };
  }

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to send email", { message, subject: input.subject });
    return { success: false, error: message };
  }
}
