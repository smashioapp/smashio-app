const { withAppBuildGradle } = require("@expo/config-plugins");

// expo prebuild regenerates android/ from scratch every run, so the release
// signingConfig has to be injected here rather than hand-edited in build.gradle.
// Values come from gradle.properties (MYAPP_UPLOAD_*), set by CI or local dev.
function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes("MYAPP_UPLOAD_STORE_FILE")) {
      return config;
    }

    contents = contents.replace(
      /signingConfigs\s*{\s*debug\s*{[^}]*}\s*}/,
      (debugBlock) => `${debugBlock.slice(0, -1)}
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }
    }`
    );

    contents = contents.replace(
      /(release\s*{\s*\n\s*\/\/ Caution![^\n]*\n\s*\/\/ see[^\n]*\n\s*)signingConfig signingConfigs\.debug/,
      "$1signingConfig signingConfigs.release"
    );

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidReleaseSigning;
