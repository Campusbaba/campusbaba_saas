import { z } from "zod";

export const RMS_ENV_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BASE_DOMAIN",
] as const;

export const rmsEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().default("http://localhost:5001/api/v1"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3001"),
  NEXT_PUBLIC_BASE_DOMAIN: z.string().default("campusbaba.com"),
});

export const rmsEnv = rmsEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
});
