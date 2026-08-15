import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Platform } from "react-native";
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
            router.replace("/onboarding/profile-photo");
            return;
          }
        }
      }

      const { data } = await supabase.auth.getSession();
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
