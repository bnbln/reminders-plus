const { withPodfile } = require("expo/config-plugins");

module.exports = function withIosPodsSettings(config) {
  return withPodfile(config, (config) => {
    let contents = config.modResults.contents;
    const helper = "require_relative '../scripts/ios-pods-settings'";
    if (!contents.includes(helper)) {
      contents = `${helper}\n${contents}`;
    }
    if (!contents.includes("configure_reminds_pods(installer,")) {
      const hook = /react_native_post_install\([\s\S]*?\n    \)/;
      if (!hook.test(contents)) {
        throw new Error("[with-ios-pods-settings] React Native post-install hook not found");
      }
      contents = contents.replace(
        hook,
        "$&\n    configure_reminds_pods(installer, podfile_properties['ios.deploymentTarget'] || '16.4')"
      );
    }
    config.modResults.contents = contents;
    return config;
  });
};
