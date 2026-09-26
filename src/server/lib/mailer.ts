import nodemailer from "nodemailer";
import { env } from "../env";

export type Mail = { to: string; subject: string; text: string; html?: string };
export type Mailer = (mail: Mail) => Promise<void>;

export function createMailer(): Mailer {
  const url = env.smtpUrl;
  if (!url) {
    return async (mail) => {
      console.info(`[mail] (SMTP_URL not set; not sent)\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    };
  }
  const transport = nodemailer.createTransport(url);
  return async (mail) => {
    await transport.sendMail({ from: env.mailFrom, ...mail });
  };
}
