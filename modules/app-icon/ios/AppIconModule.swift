import ExpoModulesCore
import UIKit

public class AppIconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppIcon")

    // `UIApplication` must be used on the main thread, hence `.runOnQueue(.main)`.
    AsyncFunction("supportsAlternateIconsAsync") { () -> Bool in
      return UIApplication.shared.supportsAlternateIcons
    }.runOnQueue(.main)

    AsyncFunction("getIconNameAsync") { () -> String? in
      return UIApplication.shared.alternateIconName
    }.runOnQueue(.main)

    // `nil` restores the primary icon. iOS shows its own confirmation alert
    // after every successful change; it cannot be suppressed.
    AsyncFunction("setIconNameAsync") { (name: String?, promise: Promise) in
      UIApplication.shared.setAlternateIconName(name) { error in
        if let error {
          promise.reject(error)
        } else {
          promise.resolve(nil)
        }
      }
    }.runOnQueue(.main)
  }
}
