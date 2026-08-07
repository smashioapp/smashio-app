import { Redirect } from "expo-router";
import { useAppStore } from "../lib/store";

export default function Index() {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  return <Redirect href={hasOnboarded ? "/(tabs)/discover" : "/onboarding"} />;
}
