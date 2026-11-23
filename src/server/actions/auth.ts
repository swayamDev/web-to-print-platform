"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  resetPasswordSchema,
  safeRedirectPath,
  signupSchema,
  toFieldErrors,
  type FieldErrors,
} from "@/domain/auth";
import { requireUser } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server";

/** State returned to forms by every auth action (used with React's useActionState). */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echo of non-secret inputs so the form keeps them after an error. */
  values?: Record<string, string>;
};

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: text(formData, "email") };
  const parsed = loginSchema.safeParse({
    email: values.email,
    password: text(formData, "password"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // Same message for unknown email and wrong password, so accounts cannot be probed.
    return { status: "error", message: "Email or password is incorrect.", values };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  const home = profile?.role === "admin" ? "/admin" : "/account";
  redirect(safeRedirectPath(text(formData, "next"), home));
}

// -----------------------------------------------------------------------------
// Signup (email confirmation is off: DECISIONS D-11)
// -----------------------------------------------------------------------------
export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { fullName: text(formData, "fullName"), email: text(formData, "email") };
  const parsed = signupSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${serverEnv().APP_URL}/auth/callback`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      return {
        status: "error",
        fieldErrors: { email: "An account with this email already exists. Try logging in." },
        values,
      };
    }
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: error.message }, values };
    }
    return {
      status: "error",
      message: "We could not create your account. Please try again.",
      values,
    };
  }

  // If email confirmation is ever switched on, there is no session until the link is clicked.
  if (!data.session) {
    return {
      status: "success",
      message: "Check your inbox for a link to confirm your email address.",
    };
  }

  redirect(safeRedirectPath(text(formData, "next"), "/account"));
}

// -----------------------------------------------------------------------------
// Password reset
// -----------------------------------------------------------------------------
export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: text(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${serverEnv().APP_URL}/auth/callback?next=/reset-password`,
  });

  // Always the same answer, whether or not the account exists.
  return {
    status: "success",
    message: "If an account exists for that email, we have sent a link to reset the password.",
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser("/reset-password");
  const parsed = resetPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const message =
      error.code === "same_password"
        ? "Choose a password different from your current one."
        : "We could not update your password. Please request a new link.";
    return { status: "error", message };
  }
  return { status: "success", message: "Your password has been updated." };
}

// -----------------------------------------------------------------------------
// Logout
// -----------------------------------------------------------------------------
export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// -----------------------------------------------------------------------------
// Profile (customer contact details; the role column cannot be changed here)
// -----------------------------------------------------------------------------
export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser("/account/profile");
  const values = {
    fullName: text(formData, "fullName"),
    companyName: text(formData, "companyName"),
    phone: text(formData, "phone"),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };
  }

  // Runs as the user: RLS limits it to their own row and column grants block `role`.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName || null,
      company_name: parsed.data.companyName || null,
      phone: parsed.data.phone || null,
    })
    .eq("id", user.id);

  if (error) {
    return {
      status: "error",
      message: "We could not save your details. Please try again.",
      values,
    };
  }

  revalidatePath("/account", "layout");
  return { status: "success", message: "Your details have been saved.", values };
}
