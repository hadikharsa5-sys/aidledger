"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginState = { error: string; email: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const callbackUrl = formData.get("callbackUrl");
  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      redirectTo: typeof callbackUrl === "string" && callbackUrl.startsWith("/") ? callbackUrl : "/",
    });
  } catch (err) {
    // signIn redirects by throwing; only real login failures are caught here.
    if (err instanceof AuthError) return { error: "Wrong email or password.", email };
    throw err;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
