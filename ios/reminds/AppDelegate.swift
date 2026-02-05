import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  private var tabBarAccessoryCoordinator: AnyObject?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)

    if #available(iOS 26.0, *) {
      let coordinator = TabBarAccessoryCoordinator(windowProvider: { [weak self] in
        self?.window
      })
      coordinator.start()
      tabBarAccessoryCoordinator = coordinator
    }
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

@available(iOS 26.0, *)
private final class TabBarAccessoryCoordinator: NSObject {
  private let windowProvider: () -> UIWindow?
  private var installAttemptsRemaining = 0
  private var isInstallLoopRunning = false
  private weak var attachedTabBarController: UITabBarController?
  private weak var observedScrollHostViewController: UIViewController?
  private weak var observedScrollView: UIScrollView?
  private lazy var addButton = AddReminderAccessoryButton(target: self, action: #selector(handleAddReminderTap))

  init(windowProvider: @escaping () -> UIWindow?) {
    self.windowProvider = windowProvider
    super.init()
  }

  func start() {
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleWindowDidBecomeVisible),
      name: UIWindow.didBecomeVisibleNotification,
      object: nil
    )

    scheduleInstallAttempts()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func handleDidBecomeActive() {
    scheduleInstallAttempts(maxAttempts: 120)
  }

  @objc private func handleWindowDidBecomeVisible() {
    scheduleInstallAttempts(maxAttempts: 120)
  }

  private func scheduleInstallAttempts(maxAttempts: Int = 80) {
    installAttemptsRemaining = max(installAttemptsRemaining, maxAttempts)
    guard !isInstallLoopRunning else {
      return
    }

    isInstallLoopRunning = true
    attemptInstallLoop()
  }

  private func attemptInstallLoop() {
    _ = installIfNeeded()

    guard installAttemptsRemaining > 0 else {
      isInstallLoopRunning = false
      return
    }

    installAttemptsRemaining -= 1
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      self?.attemptInstallLoop()
    }
  }

  @discardableResult
  private func installIfNeeded() -> Bool {
    guard let tabBarController = resolveTabBarController() else {
      return false
    }

    tabBarController.tabBarMinimizeBehavior = .onScrollDown
    bindObservedScrollViewIfNeeded(for: tabBarController)

    if attachedTabBarController !== tabBarController || tabBarController.bottomAccessory == nil {
      let accessory = UITabAccessory(contentView: addButton)
      tabBarController.setBottomAccessory(accessory, animated: true)
      attachedTabBarController = tabBarController
    }

    return true
  }

  private func bindObservedScrollViewIfNeeded(for tabBarController: UITabBarController) {
    guard let selectedContainer = tabBarController.selectedViewController else {
      return
    }
    let selectedHost = Self.resolveVisibleContentViewController(from: selectedContainer) ?? selectedContainer
    guard let rootView = selectedContainer.viewIfLoaded ?? selectedHost.viewIfLoaded else {
      return
    }

    let scrollView = Self.findBestScrollableView(in: rootView)
    let hostChanged = observedScrollHostViewController !== selectedHost
    let scrollChanged = observedScrollView !== scrollView

    guard hostChanged || scrollChanged else {
      return
    }

    let observedEdges: NSDirectionalRectEdge = [.top, .bottom]
    let owner = scrollView.flatMap { Self.findOwningViewController(for: $0) }

    var controllersToBind: [UIViewController] = []
    if let owner {
      controllersToBind.append(owner)
    }
    controllersToBind.append(selectedContainer)
    controllersToBind.append(selectedHost)
    if let nav = selectedHost.navigationController {
      controllersToBind.append(nav)
    }

    var seen = Set<ObjectIdentifier>()
    for controller in controllersToBind {
      let id = ObjectIdentifier(controller)
      if seen.contains(id) {
        continue
      }
      seen.insert(id)
      controller.setContentScrollView(scrollView, for: observedEdges)
    }
    tabBarController.setContentScrollView(scrollView, for: observedEdges)

#if DEBUG
    let className = scrollView.map { String(describing: type(of: $0)) } ?? "nil"
    let ownerClassName = owner.map { String(describing: type(of: $0)) } ?? "nil"
    let score = scrollView.map { Self.scrollBindingScore(for: $0, rootView: rootView) } ?? 0
    NSLog(
      "[TabAccessory] Bound scroll view: %@ score: %.1f host: %@ owner: %@",
      className,
      score,
      String(describing: type(of: selectedHost)),
      ownerClassName
    )
#endif

    observedScrollHostViewController = selectedHost
    observedScrollView = scrollView
  }

  private func resolveTabBarController() -> UITabBarController? {
    var roots: [UIViewController] = []
    var seenRootIDs = Set<ObjectIdentifier>()

    if let providedRoot = windowProvider()?.rootViewController {
      let id = ObjectIdentifier(providedRoot)
      seenRootIDs.insert(id)
      roots.append(providedRoot)
    }

    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else {
        continue
      }
      for window in windowScene.windows {
        guard let root = window.rootViewController else {
          continue
        }
        let id = ObjectIdentifier(root)
        if seenRootIDs.contains(id) {
          continue
        }
        seenRootIDs.insert(id)
        roots.append(root)
      }
    }

    var candidates: [UITabBarController] = []
    for root in roots {
      candidates.append(contentsOf: Self.findTabBarControllers(in: root))
    }

    if let visible = candidates.first(where: { $0.viewIfLoaded?.window != nil }) {
      return visible
    }

    return candidates.first
  }

  @objc private func handleAddReminderTap() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    guard let url = URL(string: "reminds:///task/create-modal") else {
      return
    }
    UIApplication.shared.open(url, options: [:], completionHandler: nil)
  }

  private static func findTabBarControllers(in viewController: UIViewController) -> [UITabBarController] {
    var result: [UITabBarController] = []

    if let tabBarController = viewController as? UITabBarController {
      result.append(tabBarController)
    }

    for child in viewController.children {
      result.append(contentsOf: findTabBarControllers(in: child))
    }

    if let presented = viewController.presentedViewController {
      result.append(contentsOf: findTabBarControllers(in: presented))
    }

    return result
  }

  private static func resolveVisibleContentViewController(from viewController: UIViewController?) -> UIViewController? {
    guard let viewController else {
      return nil
    }

    if let tab = viewController as? UITabBarController {
      return resolveVisibleContentViewController(from: tab.selectedViewController)
    }

    if let nav = viewController as? UINavigationController {
      return resolveVisibleContentViewController(from: nav.visibleViewController ?? nav.topViewController)
    }

    if let split = viewController as? UISplitViewController {
      return resolveVisibleContentViewController(from: split.viewControllers.last)
    }

    if let presented = viewController.presentedViewController {
      return resolveVisibleContentViewController(from: presented)
    }

    if let visibleChild = viewController.children.reversed().first(where: { child in
      guard let childView = child.viewIfLoaded else { return false }
      return childView.window != nil && !childView.isHidden && childView.alpha > 0.01 && childView.bounds.height > 1
    }) {
      return resolveVisibleContentViewController(from: visibleChild)
    }

    return viewController
  }

  private static func findBestScrollableView(in rootView: UIView) -> UIScrollView? {
    var queue: [UIView] = [rootView]
    var candidates: [UIScrollView] = []

    while !queue.isEmpty {
      let view = queue.removeFirst()

      if let scrollView = view as? UIScrollView,
         scrollView.isScrollEnabled,
         !scrollView.isHidden,
         scrollView.alpha > 0.01 {
        candidates.append(scrollView)
      }

      queue.append(contentsOf: view.subviews)
    }

    guard !candidates.isEmpty else {
      return nil
    }

    return candidates.max { lhs, rhs in
      scrollBindingScore(for: lhs, rootView: rootView) < scrollBindingScore(for: rhs, rootView: rootView)
    }
  }

  private static func scrollBindingScore(for scrollView: UIScrollView, rootView: UIView) -> CGFloat {
    guard scrollView.isScrollEnabled,
          !scrollView.isHidden,
          scrollView.alpha > 0.01,
          scrollView.isUserInteractionEnabled,
          scrollView.bounds.height > 44 else {
      return -.greatestFiniteMagnitude
    }

    let verticalOverflow = max(
      0,
      (scrollView.contentSize.height + scrollView.adjustedContentInset.top + scrollView.adjustedContentInset.bottom) - scrollView.bounds.height
    )

    let className = String(describing: type(of: scrollView))
    let isReactNativeScrollView = className.contains("RCT") && className.contains("ScrollView")
    let isTableLike = scrollView is UITableView || className.contains("CollectionView")
    let canBounceVertically = scrollView.alwaysBounceVertical || verticalOverflow > 1

    guard canBounceVertically else {
      return -.greatestFiniteMagnitude
    }

    let frameInRoot = scrollView.convert(scrollView.bounds, to: rootView)
    let visibleHeight = max(0, frameInRoot.intersection(rootView.bounds).height)

    var score = verticalOverflow
    score += visibleHeight * 2
    score += min(scrollView.bounds.height, 900) * 0.2

    if isReactNativeScrollView {
      score += 12_000
    } else if isTableLike {
      score += 8_000
    }

    return score
  }

  private static func findOwningViewController(for view: UIView) -> UIViewController? {
    var responder: UIResponder? = view
    while let current = responder {
      if let controller = current as? UIViewController {
        return controller
      }
      responder = current.next
    }
    return nil
  }
}

@available(iOS 26.0, *)
private final class AddReminderAccessoryButton: UIButton {
  private let regularTitle = AddReminderAccessoryButton.localizedTitle()
  private let accentBlueTranslucent = UIColor(red: 10.0 / 255.0, green: 132.0 / 255.0, blue: 1.0, alpha: 0.72)

  init(target: Any?, action: Selector) {
    super.init(frame: .zero)

    titleLabel?.adjustsFontForContentSizeCategory = true
    titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
    titleLabel?.lineBreakMode = .byTruncatingTail
    titleLabel?.adjustsFontSizeToFitWidth = true
    titleLabel?.minimumScaleFactor = 0.9
    titleLabel?.numberOfLines = 1
    setContentCompressionResistancePriority(.required, for: .horizontal)
    setContentHuggingPriority(.required, for: .horizontal)
    contentHorizontalAlignment = .center

    accessibilityLabel = regularTitle
    accessibilityTraits.insert(.button)
    addTarget(target, action: action, for: .touchUpInside)
    updateLayoutForAccessoryEnvironment()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    updateLayoutForAccessoryEnvironment()
  }

  override var intrinsicContentSize: CGSize {
    var size = super.intrinsicContentSize
    if size.width < 44 {
      size.width = 44
    }
    if size.height < 36 {
      size.height = 36
    }
    return size
  }

  private func updateLayoutForAccessoryEnvironment() {
    let environment = traitCollection[UITraitTabAccessoryEnvironment.self]
    let isInline = environment == .inline

    var config = UIButton.Configuration.filled()
    config.baseBackgroundColor = accentBlueTranslucent
    config.baseForegroundColor = .white
    config.cornerStyle = .capsule
    config.image = UIImage(systemName: "plus")
    config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 13, weight: .bold)
    config.imagePlacement = .leading
    config.imagePadding = isInline ? 0 : 8
    config.title = isInline ? nil : regularTitle
    config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: isInline ? 10 : 16, bottom: 8, trailing: isInline ? 10 : 16)

    configuration = config
    tintColor = .white
    invalidateIntrinsicContentSize()
  }

  private static func localizedTitle() -> String {
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()

    if localeTag.hasPrefix("de") { return "Aufgabe hinzufügen" }
    if localeTag.hasPrefix("es") { return "Añadir tarea" }
    if localeTag.hasPrefix("fr") { return "Ajouter une tâche" }
    if localeTag.hasPrefix("pt") { return "Adicionar tarefa" }
    if localeTag.hasPrefix("hi") { return "कार्य जोड़ें" }
    if localeTag.hasPrefix("zh") { return "添加任务" }
    if localeTag.hasPrefix("ja") { return "タスクを追加" }

    return "Add task"
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
