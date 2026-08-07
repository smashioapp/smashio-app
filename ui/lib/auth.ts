import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
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

// Matches the `smashio://onboarding` redirect URL whitelisted in the Supabase dashboard.
export async function continueWithGoogle() {
  const redirectTo = Linking.createURL("onboarding");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return;

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code;
  if (typeof code !== "string") {
    throw new Error(queryParams?.error_description?.toString() ?? "Google sign-in was cancelled.");
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
