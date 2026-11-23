import { z } from "zod";

/**
 * Validation for authentication forms, shared by the browser (instant feedback) and the
 * server actions (the real check).
 */

export const PASSWORD_MIN_LENGTH = 8;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Use at least ${PASSWORD_MIN_LENGTH} characters.` })
  .max(72, { error: "Use 72 characters or fewer." });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Enter your password." }),
});

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: "Enter your name." })
    .max(120, { error: "Use 120 characters or fewer." }),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    error: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({
  fullName: z.string().trim().max(120, { error: "Use 120 characters or fewer." }),
  companyName: z.string().trim().max(120, { error: "Use 120 characters or fewer." }),
  phone: z
    .string()
    .trim()
    .max(32, { error: "Use 32 characters or fewer." })
    .regex(/^[0-9+()\-.\s]*$/, { error: "Use digits, spaces and + ( ) - only." }),
});

/** Field-level error messages keyed by form field name. */
export type FieldErrors = Partial<Record<string, string>>;

/** Turn a Zod error into one message per field (the first issue wins). */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Sanitise a post-login "next" path so it can only point inside this site.
 * Blocks open redirects such as "https://evil.example", "//evil.example" or "/\evil".
 */
export function safeRedirectPath(next: unknown, fallback = "/account"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  // Never bounce back into the auth pages themselves.
  if (/^\/(login|signup|forgot-password)(\/|\?|$)/.test(next)) return fallback;
  return next;
}
