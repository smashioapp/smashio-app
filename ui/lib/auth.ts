import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { unregisterPushToken } from "./notifications";

// Native sign-in needs client IDs registered in Google Cloud / Apple and mirrored into the
// Supabase provider's authorized-client list. Until those exist the app falls back to the
// hosted OAuth flow below, which works everywhere but shows iOS's ASWebAuthenticationSession
// consent alert ("Smashio wants to use <project>.supabase.co to sign in") on every attempt.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";

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
async function hostedOAuth(provider: "google" | "apple") {
  const redirectTo = Linking.createURL("onboarding");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  if (Platform.OS === "web") {
    // window.open() after an await misses Chrome's user-activation window and gets
    // popup-blocked. A full-page redirect has no such restriction — SessionProvider
    // picks the `code` param back up on reload.
    window.location.href = data.url;
    return;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") throw new Error("Sign-in was cancelled.");

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code;
  if (typeof code !== "string") {
    throw new Error(queryParams?.error_description?.toString() ?? "Sign-in was cancelled.");
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

// google-signin is a native module with no Expo Go build, so it is required lazily —
// touching it at import time would crash the whole bundle in Expo Go and on web.
function googleSignInModule() {
  if (Platform.OS === "web" || !GOOGLE_WEB_CLIENT_ID) return null;
  try {
    return require("@react-native-google-signin/google-signin") as typeof import("@react-native-google-signin/google-signin");
  } catch {
    return null;
  }
}

export async function continueWithGoogle() {
  const mod = googleSignInModule();
  if (!mod) return hostedOAuth("google");

  mod.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  });
  await mod.GoogleSignin.hasPlayServices();

  const response = await mod.GoogleSignin.signIn();
  if (response.type === "cancelled") throw new Error("Sign-in was cancelled.");

  const idToken = response.data?.idToken;
  if (!idToken) throw new Error("Google didn't return an ID token.");

  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error) throw error;
}

// Apple hands back `fullName` on the FIRST authorisation for this Apple ID only — never
// again, on any device. If it isn't persisted here it's gone, and the setup screen would
// show an empty name for a user who never typed one.
export async function continueWithApple() {
  if (Platform.OS !== "ios" || !(await AppleAuthentication.isAvailableAsync().catch(() => false))) {
    return hostedOAuth("apple");
  }

  // Supabase verifies the raw nonce against the SHA-256 digest embedded in Apple's token,
  // so Apple gets the hash and Supabase gets the original.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      nonce: hashedNonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: string }).code === "ERR_REQUEST_CANCELED") {
      throw new Error("Sign-in was cancelled.");
    }
    throw e;
  }

  if (!credential.identityToken) throw new Error("Apple didn't return an identity token.");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  const appleName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
  if (appleName && data.user) {
    // Straight onto the profile row rather than user_metadata: this is the only moment it
    // is ever available, and the profiles row is what the setup screen and the rest of the
    // app actually read. Best-effort — a failure here must not fail the sign-in.
    await supabase
      .from("profiles")
      .update({ display_name: appleName })
      .eq("id", data.user.id)
      .eq("display_name", "")
      .then(undefined, () => {});
  }
}

export async function signOut() {
  // Drop this device's push token first, while the session still passes push_tokens' self-only
  // RLS. Without it the signed-out account keeps receiving pushes on this device — including
  // chat message bodies — which on a shared or resold phone is a privacy leak, not just noise.
  await unregisterPushToken();

  // Native Google keeps its own signed-in state; leaving it behind makes the next
  // "Continue with Google" silently reuse the account the user just signed out of.
  const mod = googleSignInModule();
  if (mod) await mod.GoogleSignin.signOut().catch(() => {});

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
