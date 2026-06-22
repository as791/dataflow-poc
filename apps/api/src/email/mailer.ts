import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

// If SMTP_USER is set (e.g. Twilio SendGrid API key), use authenticated TLS.
// Otherwise fall back to unauthenticated Mailhog for local dev.
const useAuth = Boolean(process.env.SMTP_USER);

const transporter = nodemailer.createTransport(
  useAuth
    ? {
        host: process.env.SMTP_HOST ?? 'smtp.sendgrid.net',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: false,           // STARTTLS on 587
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      }
    : {
        host: process.env.SMTP_HOST ?? 'mailhog',
        port: Number(process.env.SMTP_PORT ?? 1025),
        secure: false,
        ignoreTLS: true,         // Mailhog needs no TLS/auth
      },
);

const FROM = process.env.SMTP_FROM ?? 'noreply@dataflow.local';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

function render(template: string, vars: Record<string, string>): string {
  const filePath = path.join(__dirname, 'templates', `${template}.html`);
  let html = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.replaceAll(`{{${k}}}`, v);
  }
  return html;
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: FROM, to, subject: 'Verify your DataFlow email',
    html: render('verify', { link }),
  });
}

export async function sendInviteEmail(to: string, token: string, tenantName: string, inviterEmail: string): Promise<void> {
  const link = `${APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: FROM, to, subject: `${inviterEmail} invited you to ${tenantName} on DataFlow`,
    html: render('invite', { link, tenantName, inviter: inviterEmail }),
  });
}
