import { useNetworkState } from "expo-network";

// isConnected/isInternetReachable are undefined until the first native read resolves — treat
// that as online so a cold screen mount never flashes the offline state before we actually know.
export function useOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetworkState();
  if (isConnected === false) return false;
  if (isInternetReachable === false) return false;
  return true;
}
