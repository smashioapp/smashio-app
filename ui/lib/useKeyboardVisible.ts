import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

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
