import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Linking, Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "./supabase";
import { consumePendingReferral } from "./referral";

// Best-effort, once per captured link (profile-plan.md P5) — consumePendingReferral clears the
// stored code itself, so this can safely run on every SIGNED_IN without re-attributing.
async function attributeReferral(userId: string) {
  const referrerId = await consumePendingReferral();
  if (!referrerId || referrerId === userId) return;
  await supabase.from("profiles").update({ referred_by: referrerId }).eq("id", userId).is("referred_by", null);
}

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextValue>({ session: null, isLoading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      // Web's Google sign-in does a full-page redirect (see continueWithGoogle),
      // so the session comes back as a `code` query param on reload, not an
      // in-memory promise resolution.
      if (Platform.OS === "web") {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          window.history.replaceState({}, "", window.location.pathname);
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            setSession(data.session);
            setIsLoading(false);
            // Route through the index gate, not straight at profile setup — an existing
            // user coming back through OAuth already has a profile and must not be
            // walked through onboarding again.
            router.replace("/");
            return;
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      // login-form.yaml opts out via ?e2e_manual_login=1 on the cold-launch deep link —
      // it exercises the typed sign-in form and needs the onboarding screen to actually
      // render instead of being skipped by the shortcut below.
      const initialUrl = __DEV__ ? await Linking.getInitialURL() : null;
      const manualLoginRequested = !!initialUrl && new URLSearchParams(initialUrl.split("?")[1]).get("e2e_manual_login") === "1";
      if (!data.session && __DEV__ && process.env.EXPO_PUBLIC_E2E_EMAIL && !manualLoginRequested) {
        // Maestro flows skip the login form entirely — typing on the emulator can take
        // 10s/char (Maestro #2718 on API 36+ animation-idle wait). __DEV__ guard keeps
        // this out of release builds. supabase-js's fetch has no built-in timeout, and a
        // fresh emulator's network can take a few seconds to come up after boot — without
        // a race this can hang forever, and index.tsx renders null while isLoading is
        // true, so the app never gets past a black screen. Fall through to the normal
        // (logged-out) path on failure or timeout instead of blocking on it.
        try {
          const signInResult = await Promise.race([
            supabase.auth.signInWithPassword({
              email: process.env.EXPO_PUBLIC_E2E_EMAIL,
              password: process.env.EXPO_PUBLIC_E2E_PASSWORD!,
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("E2E auto-login timed out")), 15000)),
          ]);
          if (signInResult.data.session) {
            setSession(signInResult.data.session);
            setIsLoading(false);
            return;
          }
          if (signInResult.error) console.warn("[e2e] auto-login failed:", signInResult.error.message);
        } catch (err) {
          console.warn("[e2e] auto-login errored:", err);
        }
      }
      setSession(data.session);
      setIsLoading(false);
    }
    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "SIGNED_IN" && nextSession) attributeReferral(nextSession.user.id).catch(() => {});
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, isLoading }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
