"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/chef",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Onjuiste e-mail of wachtwoord.";
    }
    // Re-throw zodat de redirect na succesvolle login werkt.
    throw error;
  }
}
