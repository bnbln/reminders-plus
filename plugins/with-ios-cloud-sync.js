const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function withIosCloudSync(config) {
  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    console.warn("[with-ios-cloud-sync] Missing ios.bundleIdentifier");
    return config;
  }

  const containerIdentifier = `iCloud.${bundleIdentifier}`;

  config = withEntitlementsPlist(config, (config) => {
    const entitlements = config.modResults;
    entitlements["com.apple.developer.icloud-services"] = unique([
      ...(entitlements["com.apple.developer.icloud-services"] || []),
      "CloudKit",
    ]);
    entitlements["com.apple.developer.icloud-container-identifiers"] = unique([
      ...(entitlements["com.apple.developer.icloud-container-identifiers"] || []),
      containerIdentifier,
    ]);
    entitlements["com.apple.developer.ubiquity-container-identifiers"] = unique([
      ...(entitlements["com.apple.developer.ubiquity-container-identifiers"] || []),
      containerIdentifier,
    ]);
    // Required for iOS "Time Sensitive" local/push notifications.
    entitlements["com.apple.developer.usernotifications.time-sensitive"] = true;
    return config;
  });

  config = withInfoPlist(config, (config) => {
    const backgroundModes = new Set(config.modResults.UIBackgroundModes || []);
    backgroundModes.add("remote-notification");
    config.modResults.UIBackgroundModes = Array.from(backgroundModes);
    return config;
  });

  return config;
}

module.exports = withIosCloudSync;
