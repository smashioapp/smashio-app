import { Modal, Pressable, View, Text, KeyboardAvoidingView, ScrollView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients } from "../lib/theme";

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <LinearGradient colors={gradients.card} className="rounded-t-[24px] border-t border-x" style={{ borderColor: colors.cardBorder }}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="p-5 pb-9 gap-3"
              >
                <View className="w-9 h-1 rounded-pill self-center mb-1" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
                <Text className="font-display text-[18px]" style={{ color: colors.text }}>
                  {title}
                </Text>
                {children}
              </ScrollView>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
