/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        base: "#0A0A0B",
        surface: "#141416",
        "surface-alt": "#1F1F24",
        card: "#18181C",
        "card-alt": "#0E0E10",
        accent: "#D6FF3F",
        "accent-2": "#AEE62A",
        "accent-soft": "#EBFF7A",
        text: "#F5F5F7",
        "text-dim": "#C7C7CE",
        "text-secondary": "#96969E",
        "text-tertiary": "#7A7A82",
        "text-muted": "#5C5C64",
        border: "rgba(255,255,255,0.08)",
        beginner: "#6FCBFF",
        intermediate: "#35D6A6",
        advanced: "#FFB648",
        pro: "#C08CFF",
        danger: "#FF6767",
      },
      fontFamily: {
        display: ["BricolageGrotesque_800ExtraBold"],
        "display-bold": ["BricolageGrotesque_700Bold"],
        "display-medium": ["BricolageGrotesque_500Medium"],
        body: ["Manrope_500Medium"],
        "body-semibold": ["Manrope_600SemiBold"],
        "body-bold": ["Manrope_700Bold"],
        "body-extrabold": ["Manrope_800ExtraBold"],
      },
      borderRadius: {
        pill: 100,
      },
    },
  },
  plugins: [],
};
