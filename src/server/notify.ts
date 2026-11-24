import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import type { EmailContent } from "@/server/email/templates";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Customer notifications (PRD p9 §13). Every message is stored in the `notifications` table
 * (shown in the account, so nothing depends on email delivery), and emailed when SMTP is
 * configured. Email failures are recorded, never hidden.
 */

let transport: Transporter | null = null;

function mailer(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transport ??= nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
    connectionTimeout: 10_000,
  });
  return transport;
}

export async function notifyCustomer(input: {
  userId: string;
  email: string | null;
  orderId: string | null;
  type: string;
  content: EmailContent;
}): Promise<{ emailed: boolean }> {
  const admin = createSupabaseAdminClient();
  const base = {
    user_id: input.userId,
    order_id: input.orderId,
    type: input.type,
    subject: input.content.subject,
    body: input.content.text,
  };

  await admin.from("notifications").insert({ ...base, channel: "in_app", status: "sent" });

  const smtp = mailer();
  if (!smtp || !input.email) {
    await admin.from("notifications").insert({
      ...base,
      channel: "email",
      status: "failed",
      error: !smtp ? "Email sending is not configured (SMTP_HOST)" : "No email address",
    });
    return { emailed: false };
  }

  try {
    const info = await smtp.sendMail({
      from: process.env.EMAIL_FROM ?? "Digital Heroes Print <no-reply@localhost>",
      to: input.email,
      subject: input.content.subject,
      text: input.content.text,
      html: input.content.html,
    });
    await admin.from("notifications").insert({
      ...base,
      channel: "email",
      status: "sent",
      provider_message_id: info.messageId ?? null,
    });
    return { emailed: true };
  } catch (error) {
    await admin.from("notifications").insert({
      ...base,
      channel: "email",
      status: "failed",
      error: String((error as Error).message ?? error).slice(0, 500),
    });
    return { emailed: false };
  }
}
