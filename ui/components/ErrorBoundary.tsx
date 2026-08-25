import { Component, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import * as Sentry from "@sentry/react-native";
import { colors } from "../lib/theme";

type Props = { children: ReactNode };
type State = { error: Error | null };

// Without this, a render-time throw anywhere in the tree (e.g. a component calling an import
// that doesn't exist on the build that shipped) takes the whole app down with no trace — that's
// how build 1045 crashed on open with nothing in Sentry to show for it. This catches it, reports
// it, and shows a recoverable screen instead of a hard crash.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? undefined } },
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: colors.base, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" }}>Something's gone wrong</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }} numberOfLines={4}>
          {error.message}
        </Text>
        <Pressable onPress={this.reset} style={{ backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: colors.base, fontWeight: "700" }}>Give it another go</Text>
        </Pressable>
      </View>
    );
  }
}
