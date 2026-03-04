const { AndroidConfig, withStringsXml } = require("expo/config-plugins");

const APP_NAME = "Reminders+";

function withAndroidAppName(config) {
  return withStringsXml(config, (config) => {
    config.modResults = AndroidConfig.Strings.setStringItem(
      [
        AndroidConfig.Resources.buildResourceItem({
          name: "app_name",
          value: APP_NAME,
        }),
      ],
      config.modResults
    );
    return config;
  });
}

module.exports = withAndroidAppName;
