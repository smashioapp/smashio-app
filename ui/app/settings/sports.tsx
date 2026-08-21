import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, TIERS } from "../../lib/theme";
import { Screen } from "../../components/Screen";
import { BackButton } from "../../components/BackButton";
import { useSession } from "../../lib/session";
import { useSports, useSkillTiers } from "../../lib/queries/sports";
import { useProfileSports, useUpsertProfileSport, useRemoveProfileSport } from "../../lib/queries/profile";

// One row per active sport, a tier picker for the ones you play. Only badminton is seeded
// (supabase/seed.sql:3) so this renders one row today — built generically because CLAUDE.md:
// "Sport is a config/data concern throughout... don't hardcode sport-specific logic".
function SportRow({ sportId, slug, name, tierId }: { sportId: string; slug: string; name: string; tierId: string | null }) {
  const { data: tiers } = useSkillTiers(slug);
  const upsert = useUpsertProfileSport();
  const remove = useRemoveProfileSport();
  const playing = tierId !== null;

  return (
    <View className="rounded-2xl border p-4 gap-3" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
      <Pressable
        className="flex-row items-center justify-between"
        onPress={() => {
          if (playing) remove.mutate(sportId);
          else if (tiers?.[0]) upsert.mutate({ sportId, skillTierId: tiers[0].id });
        }}
      >
        <Text className="font-body-bold text-[15px]" style={{ color: colors.text }}>
          {name}
        </Text>
        <View
          className="w-11 h-6 rounded-pill px-0.5 justify-center"
          style={{ backgroundColor: playing ? colors.accent : "rgba(255,255,255,0.15)" }}
        >
          <View
            className="w-5 h-5 rounded-full"
            style={{ backgroundColor: colors.base, marginLeft: playing ? 20 : 0 }}
          />
        </View>
      </Pressable>
      {playing && (
        <View className="flex-row gap-2 flex-wrap">
          {tiers?.map((t) => {
            const active = t.id === tierId;
            const tierColor = TIERS.find((x) => x.id.toLowerCase() === t.slug)?.color ?? colors.accent;
            return (
              <Pressable key={t.id} onPress={() => upsert.mutate({ sportId, skillTierId: t.id })}>
                <LinearGradient
                  colors={active ? gradients.accentDiagonal : gradients.card}
                  className="rounded-pill px-3.5 py-2 border"
                  style={{ borderColor: active ? colors.accent : colors.cardBorder }}
                >
                  <Text
                    className="font-body-bold text-[12.5px]"
                    style={{ color: active ? colors.base : tierColor }}
                  >
                    {t.label}
                  </Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function SportsSettings() {
  const { session } = useSession();
  const { data: sports } = useSports();
  const { data: profileSports } = useProfileSports(session?.user.id);

  return (
    <Screen>
      <View className="flex-row items-center gap-3 px-5 pt-2 pb-1">
        <BackButton onPress={() => router.back()} />
        <Text className="font-display text-[20px]" style={{ color: colors.text }}>
          Preferred sports
        </Text>
      </View>
      <View className="px-5 pt-4 gap-3">
        {sports?.map((s) => {
          const mine = profileSports?.find((ps) => ps.sport_id === s.id);
          return <SportRow key={s.id} sportId={s.id} slug={s.slug} name={s.name} tierId={mine?.skill_tier_id ?? null} />;
        })}
      </View>
    </Screen>
  );
}
