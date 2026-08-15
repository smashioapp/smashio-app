import { View } from "react-native";
import { colors } from "../lib/theme";

// Strava's calendar heatmap, shrunk to a profile card (profile-plan.md P3) — turns a count
// into a habit you can see. grid[week][day], oldest week first.
export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <View className="flex-row gap-[3px]">
      {grid.map((week, wi) => (
        <View key={wi} className="gap-[3px]">
          {week.map((count, di) => {
            const intensity = count === 0 ? 0 : Math.min(1, 0.35 + (0.65 * count) / max);
            return (
              <View
                key={di}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2.5,
                  backgroundColor: count === 0 ? colors.surfaceAlt : colors.accent,
                  opacity: count === 0 ? 1 : intensity,
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
