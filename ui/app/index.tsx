import { Redirect } from "expo-router";
import { useSession } from "../lib/session";
import { useProfile, useProfileSports } from "../lib/queries/profile";

export default function Index() {
  const { session, isLoading: sessionLoading } = useSession();
  const userId = session?.user.id;
  const { data: profile, isLoading: profileLoading } = useProfile(userId);
  const { data: profileSports, isLoading: sportsLoading } = useProfileSports(userId);

  if (sessionLoading) return null;
  if (!session) return <Redirect href="/onboarding" />;
  if (profileLoading || sportsLoading) return null;

  const onboarded = !!profile?.display_name && (profileSports?.length ?? 0) > 0;
  return <Redirect href={onboarded ? "/(tabs)/discover" : "/onboarding"} />;
}
