import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = {
  databaseUrl: parsed.data.DATABASE_URL,
  nextauthSecret: parsed.data.NEXTAUTH_SECRET,
  nextauthUrl: parsed.data.NEXTAUTH_URL,
  googleClientId: parsed.data.GOOGLE_CLIENT_ID,
  googleClientSecret: parsed.data.GOOGLE_CLIENT_SECRET,
  isProduction: parsed.data.NODE_ENV === "production",
} as const;
