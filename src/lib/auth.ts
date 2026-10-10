import { env } from "@/src/lib/env";

export const authConfig = {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
} as const;
