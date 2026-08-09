import { FlatList, FlatListProps, RefreshControl, View } from "react-native";
import { ShuttlecockSpinner } from "./ShuttlecockSpinner";

type RefreshableListProps<T> = FlatListProps<T> & { refreshing: boolean; onRefresh: () => void };

// Same FlatList + RefreshControl every list screen was hand-wiring, but with the native
// pull spinner made invisible and a spinning shuttlecock layered on top instead.
export function RefreshableList<T>({ refreshing, onRefresh, style, ...rest }: RefreshableListProps<T>) {
  return (
    <View style={[{ flex: 1 }, style as object]}>
      <FlatList
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
