/**
 * Centralized environment variable access.
 * Components must NEVER access process.env directly.
 */

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const env = {
  databaseUrl: getEnvVar("DATABASE_URL"),
  nextauthSecret: getEnvVar("NEXTAUTH_SECRET"),
  nextauthUrl: getEnvVar("NEXTAUTH_URL"),
  googleClientId: getOptionalEnvVar("GOOGLE_CLIENT_ID", ""),
  googleClientSecret: getOptionalEnvVar("GOOGLE_CLIENT_SECRET", ""),
  isProduction: process.env.NODE_ENV === "production",
} as const;
