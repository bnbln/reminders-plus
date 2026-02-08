const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Copies the custom Reminder+.icon folder to the iOS project during prebuild
 * and adds it to the Xcode project with correct build settings.
 */
function withCustomIcon(config) {
  // First, copy the icon folder
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const sourceDir = path.join(projectRoot, "assets", "Reminder+.icon");
      const targetDir = path.join(projectRoot, "ios", "Reminder+.icon");

      if (fs.existsSync(sourceDir)) {
        copyFolderSync(sourceDir, targetDir);
        console.log("[with-custom-icon] Copied Reminder+.icon to ios/");
      } else {
        console.warn("[with-custom-icon] Source folder not found:", sourceDir);
      }

      return config;
    },
  ]);

  // Modify the Xcode project to include the icon and set build settings
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectName = config.modRequest.projectName;

    // Generate unique UUIDs for the file reference and build file
    const fileRefUuid = xcodeProject.generateUuid();
    const buildFileUuid = xcodeProject.generateUuid();

    // Add PBXFileReference for Reminder+.icon
    xcodeProject.hash.project.objects["PBXFileReference"][fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "folder.iconcomposer.icon",
      path: '"Reminder+.icon"',
      sourceTree: '"<group>"',
    };
    xcodeProject.hash.project.objects["PBXFileReference"][
      `${fileRefUuid}_comment`
    ] = "Reminder+.icon";

    // Add PBXBuildFile to include in Resources
    xcodeProject.hash.project.objects["PBXBuildFile"][buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      fileRef_comment: "Reminder+.icon",
    };
    xcodeProject.hash.project.objects["PBXBuildFile"][
      `${buildFileUuid}_comment`
    ] = "Reminder+.icon in Resources";

    // Find the main group and add the file reference
    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    const mainGroup =
      xcodeProject.hash.project.objects["PBXGroup"][mainGroupKey];
    if (mainGroup && mainGroup.children) {
      // Check if already added
      const alreadyExists = mainGroup.children.some(
        (child) => child.comment === "Reminder+.icon"
      );
      if (!alreadyExists) {
        mainGroup.children.push({
          value: fileRefUuid,
          comment: "Reminder+.icon",
        });
      }
    }

    // Find the Resources build phase and add the build file
    const pbxResourcesBuildPhase =
      xcodeProject.hash.project.objects["PBXResourcesBuildPhase"];
    for (const key in pbxResourcesBuildPhase) {
      if (typeof pbxResourcesBuildPhase[key] === "object") {
        const phase = pbxResourcesBuildPhase[key];
        if (phase.files) {
          const alreadyExists = phase.files.some(
            (file) => file.comment === "Reminder+.icon in Resources"
          );
          if (!alreadyExists) {
            phase.files.push({
              value: buildFileUuid,
              comment: "Reminder+.icon in Resources",
            });
          }
        }
      }
    }

    // Set ASSETCATALOG_COMPILER_APPICON_NAME to "Reminder+"
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (
        typeof configurations[key] === "object" &&
        configurations[key].buildSettings
      ) {
        const buildSettings = configurations[key].buildSettings;
        // Only modify the app target configurations (they have PRODUCT_NAME)
        if (
          buildSettings.PRODUCT_NAME === `"${projectName}"` ||
          buildSettings.PRODUCT_NAME === projectName
        ) {
          buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = '"Reminder+"';
          console.log(
            `[with-custom-icon] Set ASSETCATALOG_COMPILER_APPICON_NAME = Reminder+ for ${configurations[key].name}`
          );
        }
      }
    }

    console.log("[with-custom-icon] Added Reminder+.icon to Xcode project");
    return config;
  });

  return config;
}

function copyFolderSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  for (const file of files) {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);

    if (fs.statSync(sourcePath).isDirectory()) {
      copyFolderSync(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

module.exports = withCustomIcon;
