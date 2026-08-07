import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppStore } from "../lib/store";
import { colors, gradients, TIERS } from "../lib/theme";
import { VENUES, DATES, TIMES } from "../lib/mockData";
import { Chip } from "../components/Chip";

const STEP_COUNT = 6;
const NEXT_LABELS = ["Continue", "Continue", "Continue", "Continue", "Publish match", "Let's go!"];

export default function Wizard() {
  const [step, setStep] = useState(0);
  const { wizard, resetWizard, selectVenue, selectDate, selectTime, selectWizardTier, incPlayers, decPlayers, incCost, decCost, uploadConfirmation } =
    useAppStore();

  useEffect(() => {
    resetWizard();
  }, []);

  const venue = VENUES.find((v) => v.id === wizard.venueId);
  const perPlayer = (wizard.cost / wizard.maxPlayers).toFixed(0);
  const nextDisabled = step === 0 && !wizard.venueId;

  const goBack = () => {
    if (step === 0) router.back();
    else setStep(step - 1);
  };

  const goNext = () => {
    if (step === STEP_COUNT - 1) {
      router.back();
      return;
    }
    setStep(step + 1);
  };

  return (
    <View className="flex-1 pt-14" style={{ backgroundColor: "#08080A" }}>
      <View className="flex-row items-center gap-3 px-5 pb-1">
        <Pressable onPress={goBack} className="w-[34px] h-[34px] rounded-full items-center justify-center" style={{ backgroundColor: "#17171A" }}>
          <Ionicons name="chevron-back" size={16} color={colors.text} />
        </Pressable>
        <Text className="font-display text-[19px]" style={{ color: colors.text }}>
          Host a Match
        </Text>
      </View>

      <View className="flex-row gap-1.5 px-5 py-4">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <View key={i} className="flex-1 h-1 rounded-full" style={{ backgroundColor: i <= step ? colors.accent : "rgba(255,255,255,0.1)" }} />
        ))}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 20 }}>
        {step === 0 && (
          <View>
            <StepIcon name="location" />
            <StepHeading title="Pick your court" subtitle="Where's the action happening?" />
            {VENUES.map((v) => {
              const selected = wizard.venueId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => selectVenue(v.id)}
                  className="flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5 mb-2 border-[1.5px]"
                  style={{
                    backgroundColor: selected ? "#1D2416" : colors.card,
                    borderColor: selected ? colors.accent : "rgba(255,255,255,0.07)",
                  }}
                >
                  <View className="w-1 self-stretch rounded" style={{ backgroundColor: colors.beginner }} />
                  <View className="flex-1">
                    <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                      {v.name}
                    </Text>
                    <Text className="text-[11.5px] mt-0.5" style={{ color: colors.textSecondary }}>
                      {v.suburb} · {v.courts}
                    </Text>
                  </View>
                  {selected && (
                    <View className="w-6 h-6 rounded-full items-center justify-center" style={{ backgroundColor: colors.accent }}>
                      <Ionicons name="checkmark" size={13} color={colors.base} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {step === 1 && (
          <View>
            <StepIcon name="calendar" />
            <StepHeading title="When's it on?" subtitle="Lock in a day and time that suits the squad." />
            <Label>Date</Label>
            <View className="flex-row flex-wrap gap-2 mb-5">
              {DATES.map((d) => (
                <Chip key={d} label={d} active={wizard.date === d} onPress={() => selectDate(d)} />
              ))}
            </View>
            <Label>Time slot</Label>
            <View className="flex-row flex-wrap gap-2">
              {TIMES.map((t) => (
                <Chip key={t} label={t} active={wizard.time === t} onPress={() => selectTime(t)} />
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <StepIcon name="ribbon" />
            <StepHeading title="Set the level" subtitle="Match players at the right intensity." />
            {TIERS.map((t) => {
              const active = wizard.skill === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => selectWizardTier(t.id)}
                  className="flex-row items-center rounded-2xl px-3.5 py-3 mb-2 border-[1.5px]"
                  style={{ backgroundColor: active ? colors.surfaceAlt : colors.surface, borderColor: active ? t.color : "rgba(255,255,255,0.07)" }}
                >
                  <View className="w-2.5 h-2.5 rounded-full mr-2.5" style={{ backgroundColor: t.color }} />
                  <Text className="font-body-extrabold text-[14px]" style={{ color: colors.text }}>
                    {t.id}
                  </Text>
                </Pressable>
              );
            })}
            <Label style={{ marginTop: 8 }}>Max players</Label>
            <View className="flex-row items-center justify-center gap-6 rounded-2xl p-4.5 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Stepper onPress={decPlayers} icon="remove" />
              <Text className="font-display text-[28px]" style={{ color: colors.accent }}>
                {wizard.maxPlayers}
              </Text>
              <Stepper onPress={incPlayers} icon="add" />
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <StepIcon name="cash" />
            <StepHeading title="Split the cost" subtitle="Court fees, shared evenly — no awkward math." />
            <View className="flex-row items-center justify-center gap-6 rounded-2xl p-5 mb-4 border" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Stepper onPress={decCost} icon="remove" />
              <Text className="font-display text-[30px]" style={{ color: colors.accent }}>
                ${wizard.cost}
              </Text>
              <Stepper onPress={incCost} icon="add" />
            </View>
            <View
              className="rounded-2xl p-4 flex-row justify-between items-center border"
              style={{ backgroundColor: "rgba(214,255,63,0.1)", borderColor: "rgba(214,255,63,0.25)" }}
            >
              <Text className="text-[13px] font-body-bold" style={{ color: colors.accent }}>
                Even split · {wizard.maxPlayers} players
              </Text>
              <Text className="font-display-bold text-[19px]" style={{ color: colors.accent }}>
                ${perPlayer}
              </Text>
            </View>
          </View>
        )}

        {step === 4 && (
          <View>
            <StepIcon name="shield-checkmark" />
            <StepHeading
              title="Lock it in"
              subtitle="Upload your booking confirmation and other players see a Verified badge on your game."
            />
            <Pressable
              onPress={uploadConfirmation}
              className="rounded-2xl p-6.5 items-center"
              style={{
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: wizard.uploaded ? colors.intermediate : "rgba(255,255,255,0.2)",
              }}
            >
              <Text className="font-body-bold text-[13px]" style={{ color: wizard.uploaded ? colors.intermediate : colors.textMuted }}>
                {wizard.uploaded ? "✓ Uploaded — pending host review" : "Tap to upload confirmation (PDF/photo)"}
              </Text>
            </Pressable>
          </View>
        )}

        {step === 5 && (
          <View className="items-center gap-3.5 pt-3.5">
            <View className="w-[72px] h-[72px] rounded-full items-center justify-center" style={{ backgroundColor: "rgba(214,255,63,0.15)" }}>
              <Ionicons name="checkmark" size={30} color={colors.accent} />
            </View>
            <Text className="font-display text-[23px]" style={{ color: colors.text }}>
              You're hosting!
            </Text>
            <Text className="text-[12.5px] text-center max-w-[230px]" style={{ color: colors.textSecondary }}>
              Your match at {venue?.name ?? "your venue"} is live. Players will start joining any moment.
            </Text>
            <View className="w-full rounded-2xl p-4 border mt-1.5" style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
              <Text className="font-body-bold text-[14px]" style={{ color: colors.text }}>
                {venue?.name ?? "your venue"}
              </Text>
              <Text className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>
                {wizard.date} · {wizard.time}
              </Text>
              <View className="rounded-pill self-start px-2.5 py-1.5 mt-2.5" style={{ backgroundColor: "rgba(255,182,72,0.15)" }}>
                <Text className="font-body-extrabold text-[9.5px] uppercase" style={{ color: colors.advanced }}>
                  {wizard.uploaded ? "Pending verification" : "Awaiting booking upload"}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View className="px-5 pb-8 pt-3.5">
        {nextDisabled ? (
          <View className="rounded-pill py-4 items-center" style={{ backgroundColor: colors.surfaceAlt }}>
            <Text className="font-body-extrabold text-[15px]" style={{ color: colors.textMuted }}>
              {NEXT_LABELS[step]}
            </Text>
          </View>
        ) : (
          <LinearGradient colors={gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="rounded-pill">
            <Pressable onPress={goNext} className="py-4 items-center">
              <Text className="font-body-extrabold text-[15px]" style={{ color: colors.base }}>
                {NEXT_LABELS[step]}
              </Text>
            </Pressable>
          </LinearGradient>
        )}
      </View>
    </View>
  );
}

function StepIcon({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  return (
    <View className="w-11 h-11 rounded-2xl items-center justify-center mb-3.5" style={{ backgroundColor: "rgba(214,255,63,0.14)" }}>
      <Ionicons name={name} size={20} color={colors.accent} />
    </View>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="mb-4.5">
      <Text className="font-display text-[22px] mb-1" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="text-[12.5px]" style={{ color: "#8A8A92" }}>
        {subtitle}
      </Text>
    </View>
  );
}

function Label({ children, style }: { children: string; style?: object }) {
  return (
    <Text className="font-body-extrabold text-[11px] uppercase mb-2.5" style={{ color: colors.textTertiary, ...(style ?? {}) }}>
      {children}
    </Text>
  );
}

function Stepper({ onPress, icon }: { onPress: () => void; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} className="w-[38px] h-[38px] rounded-full items-center justify-center" style={{ backgroundColor: colors.surfaceAlt }}>
      <Ionicons name={icon} size={16} color={colors.text} />
    </Pressable>
  );
}
