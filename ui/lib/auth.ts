import { supabase } from "./supabase";

// Single "Continue" flow: try signing in, and if there's no account yet, sign one up.
// Keeps onboarding to one form instead of separate login/signup screens.
export async function continueWithEmail(email: string, password: string) {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (!signInError) return;

  if (!signInError.message.toLowerCase().includes("invalid login credentials")) {
    throw signInError;
  }

  const { error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) throw signUpError;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
