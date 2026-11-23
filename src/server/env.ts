import "server-only";

import { z } from "zod";

/** Server-only environment variables. Never import this file from client code. */
const serverEnvSchema = z.object({
  APP_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse({
    APP_URL: process.env.APP_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid server environment variables: ${names}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
