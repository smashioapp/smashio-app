import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// Shared by the chat header (collapses while composing) and the composer (quick replies,
// bottom padding) — was private to ChatComposer, lifted so the screen can react to it too.
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

// Real keyboard height in px, iOS only — used to pad the chat screen directly instead of
// trusting KeyboardAvoidingView's "padding" behavior, which under-counted the composer's
// quick-reply row and left the send button tucked under the keyboard. keyboardWillShow fires
// with the final target height before the slide-up animation starts, so this tracks it exactly.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
