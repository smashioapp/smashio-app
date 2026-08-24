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
      // NOT setting usesAppleSignIn yet. It adds the com.apple.developer.applesignin
      // entitlement, and build-ios.yml signs manually from a stored provisioning profile
      // that predates the capability — the archive would fail codesign. Guideline 4.8 is
      // still satisfied meanwhile by the hosted-OAuth Apple path in lib/auth.ts.
      // To turn native Apple on: enable Sign In with Apple on the App ID, regenerate the
      // distribution profile into IOS_PROVISIONING_PROFILE_BASE64, add usesAppleSignIn and
      // the "expo-apple-authentication" plugin back, then set
      // EXPO_PUBLIC_APPLE_NATIVE_SIGNIN=1. See docs/auth-onboarding-plan.md §5.
      buildNumber: process.env.BUILD_NUMBER ?? "1",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      // Universal Links: tapping https://smashio.com.au/game/<id> opens the app directly
      // instead of the dead-end smashio:// custom scheme when it's not installed.
      // AASA file lives at website/.well-known/apple-app-site-association.
      associatedDomains: ["applinks:smashio.com.au"],
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
      softwareKeyboardLayoutMode: "resize",
      // Android equivalent of the iOS associatedDomains above: tapping
      // https://smashio.com.au/game|venue|player/<id> opens the app instead of the
      // browser. Verified via website/.well-known/assetlinks.json (autoVerify).
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "smashio.com.au", pathPattern: "/game/.*" },
            { scheme: "https", host: "smashio.com.au", pathPattern: "/venue/.*" },
            { scheme: "https", host: "smashio.com.au", pathPattern: "/player/.*" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    owner: "smashios-team",
    extra: {
      eas: {
        projectId: "e540e051-db0a-488c-82a6-1f917cbba5a5",
      },
    },
    // OTA JS updates via EAS Update. runtimeVersion is tied to the native build (policy
    // "appVersion") so an OTA bundle only ever targets binaries built from the same
    // native code shape -- a JS-only fix ships instantly, a native dependency bump still
    // needs a fresh TestFlight build. Channel is picked per build via EXPO_PUBLIC_UPDATE_CHANNEL
    // so beta and production binaries never pull each other's updates.
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/e540e051-db0a-488c-82a6-1f917cbba5a5",
      requestHeaders: {
        "expo-channel-name": process.env.EXPO_PUBLIC_UPDATE_CHANNEL ?? "production",
      },
    },
    plugins: [
      "expo-updates",
      "expo-router",
      "expo-status-bar",
      "expo-font",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 144,
          resizeMode: "contain",
          backgroundColor: "#0A0A0B",
        },
      ],
      "expo-secure-store",
      "expo-audio",
      [
        // Reversed iOS OAuth client id. Blank until the Google Cloud iOS client exists —
        // lib/auth.ts falls back to hosted OAuth while it is, so the app still signs in.
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ?? "com.googleusercontent.apps.placeholder",
        },
      ],
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
      "expo-sharing",
      "@react-native-community/datetimepicker",
      "expo-document-picker",
    ],
  },
};
