import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(email: string, username: string, token: string): Promise<void> {
  const verifyUrl = `${process.env.APP_URL}/v1/auth/verify-email/${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@seisaku.app',
    to: email,
    subject: 'Verify your Seisaku account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a2e;">Welcome to Seisaku, ${username}!</h1>
        <p>You're one step away from creating your manga. Verify your email to get started.</p>
        <a href="${verifyUrl}" style="
          display: inline-block;
          background: #e94560;
          color: white;
          padding: 12px 28px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: bold;
          margin: 16px 0;
        ">Verify Email</a>
        <p style="color: #666; font-size: 12px;">This link expires in 24 hours. If you didn't create a Seisaku account, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, username: string, token: string): Promise<void> {
  const resetUrl = `${process.env.MOBILE_DEEP_LINK}reset-password?token=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@seisaku.app',
    to: email,
    subject: 'Reset your Seisaku password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a1a2e;">Password Reset</h1>
        <p>Hi ${username}, we received a request to reset your password.</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background: #e94560;
          color: white;
          padding: 12px 28px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: bold;
          margin: 16px 0;
        ">Reset Password</a>
        <p style="color: #666; font-size: 12px;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
      </div>
    `,
  });
}
