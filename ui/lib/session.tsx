import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "./supabase";

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

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, isLoading }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
