# Applied after React Native's post-install hook, including resource bundle targets.
def configure_reminds_pods(installer, deployment_target)
  minimum_version = Gem::Version.new(deployment_target)
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |configuration|
      current = configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
      if current && Gem::Version.new(current) < minimum_version
        configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = deployment_target
      end
    end

    next unless target.name == 'hermes-engine'

    target.shell_script_build_phases.each do |phase|
      if phase.name == '[CP-User] [Hermes] Replace Hermes for the right configuration, if needed'
        # Hermes checks Debug/Release itself; it must also run when switching configuration.
        phase.always_out_of_date = '1'
      end
    end
  end

  # Xcode's deployment recommendations were reviewed. Keep the app's explicit
  # minimum OS instead of adopting a newer SDK's recommended minimum for Pods.
  # CocoaPods deliberately disables the module verifier for its generated targets.
  # Preserve that setting for React Native's generated headers and module maps.
  installer.pods_project.build_configurations.each do |configuration|
    configuration.build_settings['DEAD_CODE_STRIPPING'] = 'YES'
    configuration.build_settings['STRING_CATALOG_GENERATE_SYMBOLS'] = 'YES'
    %w[STRIP_INSTALLED_PRODUCT STRIP_STYLE STRIP_SWIFT_SYMBOLS].each do |setting|
      configuration.build_settings.delete(setting)
    end
  end
  installer.pods_project.root_object.attributes['BuildIndependentTargetsInParallel'] = 'YES'
  installer.pods_project.root_object.attributes['LastUpgradeCheck'] = '2710'
end
