module.exports = {
  expo: {
    name: "SMASHIO",
    slug: "smashio",
    scheme: "smashio",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    backgroundColor: "#0A0A0B",
    ios: {
      supportsTablet: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-status-bar",
      "expo-font",
      "expo-splash-screen",
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          photosPermission: "SMASHIO needs access to your photos to set a profile picture.",
        },
      ],
      "@sentry/react-native",
      "expo-web-browser",
      [
        "expo-location",
        {
          locationWhenInUsePermission: "SMASHIO uses your location to show nearby games on the map.",
        },
      ],
      [
        "react-native-maps",
        {
          // Blank until a key is provisioned (see .env.example) — Android map tiles stay blank til then.
          // Restrict by package name + SHA-1 in Google Cloud Console before shipping.
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
        },
      ],
    ],
  },
};
