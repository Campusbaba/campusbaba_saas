import { z } from "zod";

export const UI_ENV_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_BASE_DOMAIN",
  "NEXT_PUBLIC_TENANT_ID",
  "NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
] as const;

export const uiEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().default("http://localhost:5001/api/v1"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_BASE_DOMAIN: z.string().default("campusbaba.com"),
  NEXT_PUBLIC_TENANT_ID: z.string().default(""),
  NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS: z.enum(["true", "false"]).default("false"),
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().default("dev-only-nextauth-secret-change-in-prod"),
});

export const uiEnv = uiEnvSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_BASE_DOMAIN: process.env.NEXT_PUBLIC_BASE_DOMAIN,
  NEXT_PUBLIC_TENANT_ID: process.env.NEXT_PUBLIC_TENANT_ID,
  NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS: process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
});
