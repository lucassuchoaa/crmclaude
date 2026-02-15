import nodemailer from 'nodemailer';

let transporter = null;

function createTransport() {
  const provider = process.env.MAIL_PROVIDER;

  if (!provider) {
    console.warn('[Email] MAIL_PROVIDER not set — email sending disabled');
    return null;
  }

  if (provider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  if (provider === 'ses') {
    return nodemailer.createTransport({
      host: `email-smtp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`,
      port: 465,
      secure: true,
      auth: {
        user: process.env.AWS_ACCESS_KEY_ID,
        pass: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  console.warn(`[Email] Unknown MAIL_PROVIDER "${provider}" — email sending disabled`);
  return null;
}

function getTransporter() {
  if (!transporter) {
    transporter = createTransport();
  }
  return transporter;
}

export async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || 'noreply@somapay.com.br',
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to}: "${subject}"`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error.message);
    return false;
  }
}

export async function sendNotificationEmail({ to, title, message }) {
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa;">
      <div style="background: #1a1a2e; padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Somapay CRM</h1>
      </div>
      <div style="background: #ffffff; padding: 32px; border: 1px solid #e9ecef;">
        <h2 style="color: #1a1a2e; margin: 0 0 16px; font-size: 18px;">${title}</h2>
        <p style="color: #495057; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${message}</p>
        <hr style="border: none; border-top: 1px solid #e9ecef; margin: 24px 0;">
        <p style="color: #adb5bd; font-size: 12px; margin: 0;">Esta é uma notificação automática do CRM Somapay.</p>
      </div>
    </div>
  `;

  return sendEmail({ to, subject: `[Somapay] ${title}`, html });
}
