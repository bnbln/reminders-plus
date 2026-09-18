internal import Expo
import UIKit

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  override func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)
    guard let window else { return }
    (UIApplication.shared.delegate as? AppDelegate)?.configureSceneWindow(window)
  }
}
