import { Tabs } from "expo-router";
import { TabBar } from "../../components/TabBar";
import { useReportAlertPoolState } from "../../lib/alertPool";

export default function TabsLayout() {
  useReportAlertPoolState();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="my-games" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
