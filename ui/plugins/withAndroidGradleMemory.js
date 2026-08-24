const { withGradleProperties } = require("@expo/config-plugins");

// expo prebuild regenerates android/gradle.properties from scratch every run, so CI
// runner memory tuning has to be injected here rather than hand-edited. GitHub's
// ubuntu-latest runners OOM (Metaspace) on expo-updates' KSP annotation processing
// with the default 512m metaspace cap — bump both the Gradle daemon and the Kotlin
// daemon (KSP runs in the latter, which org.gradle.jvmargs does not cover).
function withAndroidGradleMemory(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => !(item.type === "property" && item.key === "org.gradle.jvmargs")
    );
    config.modResults.push({
      type: "property",
      key: "org.gradle.jvmargs",
      value: "-Xmx3072m -XX:MaxMetaspaceSize=1024m",
    });
    config.modResults.push({
      type: "property",
      key: "kotlin.daemon.jvm.options",
      value: "-Xmx2048m,-XX:MaxMetaspaceSize=1024m",
    });
    return config;
  });
}

module.exports = withAndroidGradleMemory;
