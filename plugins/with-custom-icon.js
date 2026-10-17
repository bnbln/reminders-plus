const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");
const path = require("path");

const {
  PRIMARY_ICON_NAME,
  getAlternateIconNames,
  writeAppIcons,
} = require("./accent-app-icons");

/**
 * Copies the Reminder+.icon Icon Composer file to the iOS project during
 * prebuild, generates one alternate icon per accent color next to it (see
 * accent-app-icons.js) and registers all of them in the Xcode project.
 */
function withCustomIcon(config) {
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const names = writeAppIcons(projectRoot, path.join(projectRoot, "ios"));
      console.log(
        `[with-custom-icon] Wrote ${PRIMARY_ICON_NAME}.icon and ${names.join(", ")} to ios/`,
      );
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const alternateNames = getAlternateIconNames(config.modRequest.projectRoot);
    applyIconsToXcodeProject(
      config.modResults,
      config.modRequest.projectName,
      alternateNames,
    );
    console.log("[with-custom-icon] Registered app icons in Xcode project");
    return config;
  });

  return config;
}

function applyIconsToXcodeProject(xcodeProject, projectName, alternateNames) {
  for (const name of [PRIMARY_ICON_NAME, ...alternateNames]) {
    addIconFile(xcodeProject, `${name}.icon`);
  }

  const configurations = xcodeProject.pbxXCBuildConfigurationSection();
  for (const key in configurations) {
    const buildSettings = configurations[key]?.buildSettings;
    if (!buildSettings) continue;
    // Only the app target configurations have this PRODUCT_NAME.
    if (
      buildSettings.PRODUCT_NAME !== `"${projectName}"` &&
      buildSettings.PRODUCT_NAME !== projectName
    ) {
      continue;
    }
    buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = `"${PRIMARY_ICON_NAME}"`;
    buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${alternateNames.join(" ")}"`;
  }
}

// Adds `<fileName>` as an Icon Composer folder reference to the main group and
// the Resources build phase. Idempotent: an existing reference is reused.
function addIconFile(xcodeProject, fileName) {
  const objects = xcodeProject.hash.project.objects;
  const fileRefs = objects.PBXFileReference;
  const quotedPath = `"${fileName}"`;

  let fileRefUuid = Object.keys(fileRefs).find(
    (key) =>
      typeof fileRefs[key] === "object" &&
      (fileRefs[key].path === quotedPath || fileRefs[key].path === fileName),
  );
  if (!fileRefUuid) {
    fileRefUuid = xcodeProject.generateUuid();
    fileRefs[fileRefUuid] = {
      isa: "PBXFileReference",
      lastKnownFileType: "folder.iconcomposer.icon",
      path: quotedPath,
      sourceTree: '"<group>"',
    };
    fileRefs[`${fileRefUuid}_comment`] = fileName;
  }

  const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
  const mainGroup = objects.PBXGroup[mainGroupKey];
  if (mainGroup?.children && !mainGroup.children.some((child) => child.comment === fileName)) {
    mainGroup.children.push({ value: fileRefUuid, comment: fileName });
  }

  const buildFileComment = `${fileName} in Resources`;
  const buildFiles = objects.PBXBuildFile;
  let buildFileUuid = Object.keys(buildFiles).find(
    (key) => buildFiles[`${key}_comment`] === buildFileComment,
  );
  if (!buildFileUuid) {
    buildFileUuid = xcodeProject.generateUuid();
    buildFiles[buildFileUuid] = {
      isa: "PBXBuildFile",
      fileRef: fileRefUuid,
      fileRef_comment: fileName,
    };
    buildFiles[`${buildFileUuid}_comment`] = buildFileComment;
  }

  const resourcesPhases = objects.PBXResourcesBuildPhase;
  for (const key in resourcesPhases) {
    const phase = resourcesPhases[key];
    if (typeof phase !== "object" || !phase.files) continue;
    if (!phase.files.some((file) => file.comment === buildFileComment)) {
      phase.files.push({ value: buildFileUuid, comment: buildFileComment });
    }
  }
}

module.exports = withCustomIcon;
module.exports.applyIconsToXcodeProject = applyIconsToXcodeProject;
