import { forwardRef, Ref } from "react";
import { FlatList, FlatListProps, RefreshControl, View } from "react-native";
import { ShuttlecockSpinner } from "./ShuttlecockSpinner";

type RefreshableListProps<T> = FlatListProps<T> & { refreshing: boolean; onRefresh: () => void };

// Same FlatList + RefreshControl every list screen was hand-wiring, but with the native
// pull spinner made invisible and a spinning shuttlecock layered on top instead. Forwards its
// ref to the inner FlatList so screens can scrollToOffset (re-press active tab → scroll to top).
function RefreshableListInner<T>({ refreshing, onRefresh, style, ...rest }: RefreshableListProps<T>, ref: Ref<FlatList<T>>) {
  return (
    <View style={[{ flex: 1 }, style as object]}>
      <FlatList
        ref={ref}
        {...rest}
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
      />
      <ShuttlecockSpinner active={refreshing} />
    </View>
  );
}

export const RefreshableList = forwardRef(RefreshableListInner) as <T>(
  props: RefreshableListProps<T> & { ref?: Ref<FlatList<T>> }
) => ReturnType<typeof RefreshableListInner>;
