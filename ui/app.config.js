module.exports = {
  expo: {
    name: "Smashio",
    slug: "smashio",
    scheme: "smashio",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    backgroundColor: "#0A0A0B",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.smashio.app",
      buildNumber: process.env.BUILD_NUMBER ?? "1",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.smashio.app",
      versionCode: Number(process.env.BUILD_NUMBER ?? 1),
      adaptiveIcon: {
        backgroundColor: "#0A0A0B",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    extra: {
      eas: {
        projectId: "ba1a8855-77c1-457a-b7ab-2a7920f5facc",
      },
    },
    plugins: [
      "expo-router",
      "expo-status-bar",
      "expo-font",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 180,
          resizeMode: "contain",
          backgroundColor: "#0A0A0B",
        },
      ],
      "expo-secure-store",
      "expo-audio",
      [
        "expo-image-picker",
        {
          photosPermission: "Smashio needs access to your photos to set a profile picture.",
        },
      ],
      "@sentry/react-native",
      "expo-web-browser",
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Smashio uses your location to show nearby games on the map.",
        },
      ],
      [
        "react-native-maps",
        {
          // Android has no Play Store build yet and the key is iOS-restricted — Android map tiles
          // stay blank grey until a second, Android-restricted key exists (docs/map-plan.md §4).
          androidGoogleMapsApiKey: "",
          iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#0A0A0B",
        },
      ],
      [
        "expo-calendar",
        {
          calendarPermission: "Smashio adds your games to your calendar when you ask it to.",
        },
      ],
      "./plugins/withAndroidReleaseSigning",
    ],
  },
};
