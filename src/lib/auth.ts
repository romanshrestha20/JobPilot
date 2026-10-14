import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/lib/db";
import { authAdvanced, authRateLimit, resolveTrustedOrigins } from "@/lib/auth-config";
import { env } from "@/lib/env";
import * as schema from "@/lib/schema";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: resolveTrustedOrigins(env.BETTER_AUTH_URL, env.BETTER_AUTH_TRUSTED_ORIGINS),
  rateLimit: authRateLimit,
  advanced: authAdvanced,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
