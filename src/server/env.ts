function read(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  get isProduction() {
    return this.nodeEnv === "production";
  },
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get port() {
    return Number(process.env.PORT ?? 3000);
  },
  get appUrl() {
    return read("APP_URL", "http://localhost:5173").replace(/\/$/, "");
  },
  get smtpUrl() {
    return process.env.SMTP_URL || undefined;
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? "FBC Church Management <no-reply@localhost>";
  },
};
