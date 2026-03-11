import CloudKit
import CryptoKit
internal import Expo
import React
import ReactAppDependencyProvider

private extension UIColor {
  static var remindsAppBackground: UIColor {
    UIColor { traits in
      if traits.userInterfaceStyle == .dark {
        // Matches JS theme dark background: Colors.dark.background (#151718)
        return UIColor(red: 21.0 / 255.0, green: 23.0 / 255.0, blue: 24.0 / 255.0, alpha: 1)
      }
      return .white
    }
  }
}

@UIApplicationMain
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?
  private var tabBarAccessoryCoordinator: AnyObject?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
    window?.backgroundColor = UIColor.remindsAppBackground
    window?.rootViewController?.view.backgroundColor = UIColor.remindsAppBackground
    applyReactRootViewBackground()
    CloudSyncCoordinator.shared.start()
    application.registerForRemoteNotifications()

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
  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }

  override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    if CloudSyncCoordinator.shared.canHandleRemoteNotification(userInfo: userInfo) {
      Task { @MainActor in
        let result = await CloudSyncCoordinator.shared.handleRemoteNotification(userInfo: userInfo)
        completionHandler(result)
      }
      return
    }

    super.application(
      application,
      didReceiveRemoteNotification: userInfo,
      fetchCompletionHandler: completionHandler
    )
  }

  private func applyReactRootViewBackground() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard let reactRootView = self.findReactRootView(in: self.window) else { return }
      reactRootView.backgroundColor = UIColor.remindsAppBackground
      reactRootView.isOpaque = true
    }
  }

  private func findReactRootView(in window: UIWindow?) -> UIView? {
    guard let view = window?.rootViewController?.view else { return nil }
    return findReactRootView(in: view)
  }

  private func findReactRootView(in view: UIView) -> UIView? {
    let className = NSStringFromClass(type(of: view))
    if className.contains("RCTRootView") || className.contains("RCTSurfaceHostingProxyRootView") {
      return view
    }

    for subview in view.subviews {
      if let found = findReactRootView(in: subview) {
        return found
      }
    }

    return nil
  }
}

private extension Notification.Name {
  static let taskAccessoryContextDidChange = Notification.Name("TaskAccessoryContextDidChange")
}

@objc(TaskAccessoryContextBridge)
final class TaskAccessoryContextBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(setContext:projectId:projectLabel:selectedDateStart:)
  func setContext(
    _ mode: String,
    projectId: String?,
    projectLabel: String?,
    selectedDateStart: NSNumber?
  ) {
    DispatchQueue.main.async {
      NotificationCenter.default.post(
        name: .taskAccessoryContextDidChange,
        object: nil,
        userInfo: [
          "mode": mode,
          "projectId": projectId ?? "",
          "projectLabel": projectLabel ?? "",
          "selectedDateStart": selectedDateStart?.doubleValue ?? 0,
        ]
      )
    }
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
  private var accessoryMode: AddReminderAccessoryButton.Mode = .task
  private var accessoryProjectId: String?
  private var accessoryProjectLabel: String?
  private var accessorySelectedDateStart: TimeInterval?

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
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAccessoryContextDidChange(_:)),
      name: .taskAccessoryContextDidChange,
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

    Self.applyContainerBackgroundColor(in: tabBarController)

    tabBarController.tabBarMinimizeBehavior = .onScrollDown
    bindObservedScrollViewIfNeeded(for: tabBarController)

    if attachedTabBarController !== tabBarController || tabBarController.bottomAccessory == nil {
      let accessory = UITabAccessory(contentView: addButton)
      tabBarController.setBottomAccessory(accessory, animated: true)
      attachedTabBarController = tabBarController
    }
    addButton.setContext(
      mode: accessoryMode,
      projectLabel: accessoryProjectLabel,
      animated: false
    )

    return true
  }

  private static func applyContainerBackgroundColor(in viewController: UIViewController?) {
    guard let viewController else {
      return
    }

    if let tabBarController = viewController as? UITabBarController {
      tabBarController.view.backgroundColor = .remindsAppBackground
      tabBarController.view.isOpaque = true
    }

    if let navigationController = viewController as? UINavigationController {
      navigationController.view.backgroundColor = .remindsAppBackground
      navigationController.view.isOpaque = true
    }

    for child in viewController.children {
      applyContainerBackgroundColor(in: child)
    }

    if let presented = viewController.presentedViewController {
      applyContainerBackgroundColor(in: presented)
    }
  }

  @objc private func handleAccessoryContextDidChange(_ notification: Notification) {
    guard let userInfo = notification.userInfo else {
      return
    }

    let rawMode = (userInfo["mode"] as? String) ?? ""
    let mode = AddReminderAccessoryButton.Mode(rawValue: rawMode) ?? .task

    let rawProjectId = (userInfo["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let rawProjectLabel = (userInfo["projectLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let rawSelectedDateStart = (userInfo["selectedDateStart"] as? NSNumber)?.doubleValue ?? 0

    accessoryMode = mode
    accessoryProjectId = (rawProjectId?.isEmpty == false) ? rawProjectId : nil
    accessoryProjectLabel = (rawProjectLabel?.isEmpty == false) ? rawProjectLabel : nil
    if rawSelectedDateStart > 0 {
      accessorySelectedDateStart = rawSelectedDateStart
    } else if mode != .today {
      accessorySelectedDateStart = nil
    }

    addButton.setContext(
      mode: accessoryMode,
      projectLabel: accessoryProjectLabel,
      animated: true
    )
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
    guard let url = resolvedAddActionURL() else {
      return
    }
    UIApplication.shared.open(url, options: [:], completionHandler: nil)
  }

  private func resolvedAddActionURL() -> URL? {
    let effectiveMode: AddReminderAccessoryButton.Mode
    if isHomeTabSelected() {
      // Home stack should always default to "today", except the dedicated routines route.
      effectiveMode = accessoryMode == .routine ? .routine : .today
    } else {
      effectiveMode = accessoryMode
    }

    switch effectiveMode {
    case .today:
      if let selectedDateStart = accessorySelectedDateStart, selectedDateStart > 0 {
        let normalizedDateStart = Int64(selectedDateStart.rounded(.towardZero))
        return URL(string: "reminds:///task/create-modal?preset=today&dateStart=\(normalizedDateStart)")
      }
      return URL(string: "reminds:///task/create-modal?preset=today")
    case .routine:
      return URL(string: "reminds:///task/create-modal?preset=routine")
    case .project:
      return URL(string: "reminds:///project/edit-modal")
    case .inProject:
      guard let projectId = accessoryProjectId,
            !projectId.isEmpty else {
        return URL(string: "reminds:///task/create-modal")
      }
      let encodedProjectId = projectId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? projectId
      return URL(string: "reminds:///task/create-modal?projectId=\(encodedProjectId)")
    case .task:
      return URL(string: "reminds:///task/create-modal")
    }
  }

  private func isHomeTabSelected() -> Bool {
    // Prefer the tab controller we attached the accessory to; resolver can find stale candidates.
    guard let tabBarController = attachedTabBarController ?? resolveTabBarController() else {
      return false
    }
    return tabBarController.selectedIndex == 0
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
private final class AddReminderAccessoryButton: UIControl {
  enum Mode: String {
    case task
    case today
    case routine
    case project
    case inProject
  }

  private var currentMode: Mode = .task
  private var currentTitle = AddReminderAccessoryButton.localizedTaskTitle()
  private let darkAccessoryFill = UIColor(white: 1.0, alpha: 0.12)
  private let iconSize: CGFloat = 16
  private let expandedHorizontalInset: CGFloat = 16
  private let inlineHorizontalInset: CGFloat = 10
  private let expandedStackSpacing: CGFloat = 8
  private let titleCollapseThreshold: CGFloat = 0.22
  private let titleExpandThreshold: CGFloat = 0.30
  private var isInlinePlacement = false
  private var isTitleCollapsed = false

  private lazy var iconView: UIImageView = {
    let config = UIImage.SymbolConfiguration(pointSize: 14, weight: .bold)
    let view = UIImageView(image: UIImage(systemName: "plus", withConfiguration: config))
    view.translatesAutoresizingMaskIntoConstraints = false
    view.contentMode = .scaleAspectFit
    view.isUserInteractionEnabled = false
    return view
  }()

  private lazy var titleTextLabel: UILabel = {
    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = currentTitle
    label.textColor = .label
    let baseFont = UIFont.preferredFont(forTextStyle: .subheadline)
    let semiboldFont = UIFont.systemFont(ofSize: baseFont.pointSize, weight: .semibold)
    label.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: semiboldFont)
    label.adjustsFontForContentSizeCategory = true
    label.lineBreakMode = .byTruncatingTail
    label.numberOfLines = 1
    label.setContentCompressionResistancePriority(.required, for: .horizontal)
    label.setContentHuggingPriority(.required, for: .horizontal)
    label.isUserInteractionEnabled = false
    return label
  }()

  private lazy var tintOverlayView: UIView = {
    let view = UIView()
    view.translatesAutoresizingMaskIntoConstraints = false
    view.backgroundColor = .clear
    view.layer.cornerCurve = .continuous
    view.layer.cornerRadius = 18
    view.isUserInteractionEnabled = false
    return view
  }()

  private lazy var contentStack: UIStackView = {
    let stack = UIStackView(arrangedSubviews: [iconView, titleTextLabel])
    stack.translatesAutoresizingMaskIntoConstraints = false
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = expandedStackSpacing
    stack.isUserInteractionEnabled = false
    return stack
  }()

  private var leadingConstraint: NSLayoutConstraint?
  private var trailingConstraint: NSLayoutConstraint?

  init(target: Any?, action: Selector) {
    super.init(frame: .zero)

    isAccessibilityElement = true
    accessibilityTraits = [.button]
    accessibilityLabel = currentTitle
    semanticContentAttribute = .forceLeftToRight

    backgroundColor = .clear
    isOpaque = false
    clipsToBounds = false

    addSubview(tintOverlayView)
    addSubview(contentStack)
    leadingConstraint = contentStack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: expandedHorizontalInset)
    trailingConstraint = contentStack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -expandedHorizontalInset)
    NSLayoutConstraint.activate([
      tintOverlayView.topAnchor.constraint(equalTo: topAnchor),
      tintOverlayView.leadingAnchor.constraint(equalTo: leadingAnchor),
      tintOverlayView.trailingAnchor.constraint(equalTo: trailingAnchor),
      tintOverlayView.bottomAnchor.constraint(equalTo: bottomAnchor),
      leadingConstraint!,
      trailingConstraint!,
      contentStack.centerXAnchor.constraint(equalTo: centerXAnchor),
      contentStack.centerYAnchor.constraint(equalTo: centerYAnchor),
      contentStack.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: 6),
      contentStack.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -6),
      heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
      iconView.widthAnchor.constraint(equalToConstant: iconSize),
      iconView.heightAnchor.constraint(equalToConstant: iconSize),
    ])

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

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateLayoutForAccessoryEnvironment()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    syncTitleLayoutWithCurrentWidth()
  }

  override var isHighlighted: Bool {
    didSet {
      if traitCollection.userInterfaceStyle == .dark {
        tintOverlayView.alpha = isHighlighted ? 0.9 : 1
        contentStack.alpha = 1
      } else {
        tintOverlayView.alpha = 1
        contentStack.alpha = isHighlighted ? 0.7 : 1
      }
    }
  }

  override var intrinsicContentSize: CGSize {
    let horizontalPadding = isInlinePlacement ? (inlineHorizontalInset * 2) : (expandedHorizontalInset * 2)
    let spacing: CGFloat = isInlinePlacement ? 0 : expandedStackSpacing
    let titleWidth: CGFloat = isInlinePlacement ? 0 : ceil(titleTextLabel.intrinsicContentSize.width)
    let width = max(44, horizontalPadding + iconSize + spacing + titleWidth)
    return CGSize(width: width, height: 36)
  }

  func setContext(mode: Mode, projectLabel: String?, animated: Bool) {
    currentMode = mode
    let resolvedTitle = resolveTitle(for: mode, projectLabel: projectLabel)
    setTitle(resolvedTitle, animated: animated)
  }

  private func updateLayoutForAccessoryEnvironment() {
    let environment = traitCollection[UITraitTabAccessoryEnvironment.self]
    isInlinePlacement = environment == .inline

    leadingConstraint?.constant = isInlinePlacement ? inlineHorizontalInset : expandedHorizontalInset
    trailingConstraint?.constant = isInlinePlacement ? -inlineHorizontalInset : -expandedHorizontalInset

    updateAppearanceForColorScheme()
    invalidateIntrinsicContentSize()
    syncTitleLayoutWithCurrentWidth()
    setNeedsLayout()
  }

  private func updateAppearanceForColorScheme() {
    let isDark = traitCollection.userInterfaceStyle == .dark
    let contentColor = isDark ? UIColor.white : UIColor.black
    iconView.tintColor = contentColor
    titleTextLabel.textColor = contentColor
    tintOverlayView.backgroundColor = isDark ? darkAccessoryFill : .clear
    if !isHighlighted {
      contentStack.alpha = 1
      tintOverlayView.alpha = 1
    }
  }

  private func syncTitleLayoutWithCurrentWidth() {
    let inlineWidth = (inlineHorizontalInset * 2) + iconSize
    let expandedWidth = (expandedHorizontalInset * 2) + iconSize + expandedStackSpacing + ceil(titleTextLabel.intrinsicContentSize.width)
    let widthRange = max(1, expandedWidth - inlineWidth)
    let clampedWidth = min(max(bounds.width, inlineWidth), expandedWidth)
    let progress = min(max((clampedWidth - inlineWidth) / widthRange, 0), 1)

    let shouldCollapseTitle = isTitleCollapsed
      ? (progress < titleExpandThreshold)
      : (progress < titleCollapseThreshold)
    isTitleCollapsed = shouldCollapseTitle

    if titleTextLabel.isHidden != shouldCollapseTitle {
      UIView.performWithoutAnimation {
        titleTextLabel.isHidden = shouldCollapseTitle
      }
    }

    contentStack.spacing = shouldCollapseTitle ? 0 : expandedStackSpacing
  }

  private func resolveTitle(for mode: Mode, projectLabel: String?) -> String {
    switch mode {
    case .task:
      return Self.localizedTaskTitle()
    case .today:
      return Self.localizedTaskTitle()
    case .routine:
      return Self.localizedTaskTitle()
    case .project:
      return Self.localizedProjectTitle()
    case .inProject:
      let fallbackLabel = Self.localizedProjectNoun()
      let normalizedLabel = projectLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let resolvedLabel = normalizedLabel.isEmpty ? fallbackLabel : normalizedLabel
      return Self.localizedInProjectTitle(resolvedLabel)
    }
  }

  private func setTitle(_ nextTitle: String, animated: Bool) {
    guard currentTitle != nextTitle else {
      return
    }
    currentTitle = nextTitle
    accessibilityLabel = nextTitle

    let applyTitle: () -> Void = { [self] in
      titleTextLabel.text = nextTitle
      invalidateIntrinsicContentSize()
      setNeedsLayout()
      layoutIfNeeded()
    }

    guard animated, window != nil else {
      applyTitle()
      iconView.alpha = 1
      iconView.transform = .identity
      titleTextLabel.alpha = 1
      titleTextLabel.transform = .identity
      return
    }

    UIView.animate(
      withDuration: 0.12,
      delay: 0,
      options: [.curveEaseIn, .beginFromCurrentState],
      animations: {
        self.iconView.alpha = 0
        self.iconView.transform = CGAffineTransform(translationX: 0, y: -3)
        self.titleTextLabel.alpha = 0
        self.titleTextLabel.transform = CGAffineTransform(translationX: 0, y: -3)
      },
      completion: { _ in
        applyTitle()
        self.iconView.transform = CGAffineTransform(translationX: 0, y: 3)
        self.titleTextLabel.transform = CGAffineTransform(translationX: 0, y: 3)
        UIView.animate(
          withDuration: 0.18,
          delay: 0,
          options: [.curveEaseOut, .beginFromCurrentState],
          animations: {
            self.iconView.alpha = 1
            self.iconView.transform = .identity
            self.titleTextLabel.alpha = 1
            self.titleTextLabel.transform = .identity
          },
          completion: nil
        )
      }
    )
  }

  private static func localizedTaskTitle() -> String {
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()

    if localeTag.hasPrefix("de") { return "Aufgabe hinzufügen" }
    if localeTag.hasPrefix("es") { return "Agregar tarea" }
    if localeTag.hasPrefix("fr") { return "Ajouter une tâche" }
    if localeTag.hasPrefix("pt") { return "Adicionar tarefa" }
    if localeTag.hasPrefix("hi") { return "कार्य जोड़ें" }
    if localeTag.hasPrefix("zh") { return "添加任务" }
    if localeTag.hasPrefix("ja") { return "タスクを追加" }
    if localeTag.hasPrefix("it") { return "Aggiungi attività" }
    if localeTag.hasPrefix("sv") { return "Lägg till uppgift" }
    if localeTag.hasPrefix("da") { return "Tilføj opgave" }
    if localeTag.hasPrefix("fi") { return "Lisää tehtävä" }
    if localeTag.hasPrefix("pl") { return "Dodaj zadanie" }
    if localeTag.hasPrefix("nl") { return "Taak toevoegen" }
    if localeTag.hasPrefix("tr") { return "Görev ekle" }
    if localeTag.hasPrefix("cs") { return "Přidat úkol" }
    if localeTag.hasPrefix("hu") { return "Feladat hozzáadása" }
    if localeTag.hasPrefix("ro") { return "Adaugă sarcină" }
    if localeTag.hasPrefix("el") { return "Προσθήκη εργασίας" }
    if localeTag.hasPrefix("id") { return "Tambah tugas" }
    if localeTag.hasPrefix("vi") { return "Thêm nhiệm vụ" }
    if localeTag.hasPrefix("ko") { return "작업 추가" }
    if localeTag.hasPrefix("uk") { return "Додати завдання" }
    if localeTag.hasPrefix("ru") { return "Добавить задачу" }
    if localeTag.hasPrefix("ar") { return "إضافة مهمة" }

    return "Add task"
  }

  private static func localizedProjectTitle() -> String {
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()

    if localeTag.hasPrefix("de") { return "Projekt hinzufügen" }
    if localeTag.hasPrefix("es") { return "Agregar proyecto" }
    if localeTag.hasPrefix("fr") { return "Ajouter un projet" }
    if localeTag.hasPrefix("pt") { return "Adicionar projeto" }
    if localeTag.hasPrefix("hi") { return "प्रोजेक्ट जोड़ें" }
    if localeTag.hasPrefix("zh") { return "添加项目" }
    if localeTag.hasPrefix("ja") { return "プロジェクトを追加" }
    if localeTag.hasPrefix("it") { return "Aggiungi progetto" }
    if localeTag.hasPrefix("sv") { return "Lägg till projekt" }
    if localeTag.hasPrefix("da") { return "Tilføj projekt" }
    if localeTag.hasPrefix("fi") { return "Lisää projekti" }
    if localeTag.hasPrefix("pl") { return "Dodaj projekt" }
    if localeTag.hasPrefix("nl") { return "Project toevoegen" }
    if localeTag.hasPrefix("tr") { return "Proje ekle" }
    if localeTag.hasPrefix("cs") { return "Přidat projekt" }
    if localeTag.hasPrefix("hu") { return "Projekt hozzáadása" }
    if localeTag.hasPrefix("ro") { return "Adaugă proiect" }
    if localeTag.hasPrefix("el") { return "Προσθήκη έργου" }
    if localeTag.hasPrefix("id") { return "Tambah proyek" }
    if localeTag.hasPrefix("vi") { return "Thêm dự án" }
    if localeTag.hasPrefix("ko") { return "프로젝트 추가" }
    if localeTag.hasPrefix("uk") { return "Додати проєкт" }
    if localeTag.hasPrefix("ru") { return "Добавить проект" }
    if localeTag.hasPrefix("ar") { return "إضافة مشروع" }

    return "Add project"
  }

  private static func localizedProjectNoun() -> String {
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()

    if localeTag.hasPrefix("de") { return "Projekt" }
    if localeTag.hasPrefix("es") { return "Proyecto" }
    if localeTag.hasPrefix("fr") { return "Projet" }
    if localeTag.hasPrefix("pt") { return "Projeto" }
    if localeTag.hasPrefix("hi") { return "प्रोजेक्ट" }
    if localeTag.hasPrefix("zh") { return "项目" }
    if localeTag.hasPrefix("ja") { return "プロジェクト" }
    if localeTag.hasPrefix("it") { return "Progetto" }
    if localeTag.hasPrefix("sv") { return "Projekt" }
    if localeTag.hasPrefix("da") { return "Projekt" }
    if localeTag.hasPrefix("fi") { return "Projekti" }
    if localeTag.hasPrefix("pl") { return "Projekt" }
    if localeTag.hasPrefix("nl") { return "Project" }
    if localeTag.hasPrefix("tr") { return "Proje" }
    if localeTag.hasPrefix("cs") { return "Projekt" }
    if localeTag.hasPrefix("hu") { return "Projekt" }
    if localeTag.hasPrefix("ro") { return "Proiect" }
    if localeTag.hasPrefix("el") { return "Έργο" }
    if localeTag.hasPrefix("id") { return "Proyek" }
    if localeTag.hasPrefix("vi") { return "Dự án" }
    if localeTag.hasPrefix("ko") { return "프로젝트" }
    if localeTag.hasPrefix("uk") { return "Проєкт" }
    if localeTag.hasPrefix("ru") { return "Проект" }
    if localeTag.hasPrefix("ar") { return "مشروع" }

    return "Project"
  }

  private static func localizedInProjectTitle(_ label: String) -> String {
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()

    if localeTag.hasPrefix("de") { return "In \(label) hinzufügen" }
    if localeTag.hasPrefix("es") { return "Agregar en \(label)" }
    if localeTag.hasPrefix("fr") { return "Ajouter dans \(label)" }
    if localeTag.hasPrefix("pt") { return "Adicionar em \(label)" }
    if localeTag.hasPrefix("hi") { return "\(label) में जोड़ें" }
    if localeTag.hasPrefix("zh") { return "添加到\(label)" }
    if localeTag.hasPrefix("ja") { return "\(label)に追加" }
    if localeTag.hasPrefix("it") { return "Aggiungi in \(label)" }
    if localeTag.hasPrefix("sv") { return "Lägg till i \(label)" }
    if localeTag.hasPrefix("da") { return "Tilføj i \(label)" }
    if localeTag.hasPrefix("fi") { return "Lisää projektiin \(label)" }
    if localeTag.hasPrefix("pl") { return "Dodaj do \(label)" }
    if localeTag.hasPrefix("nl") { return "Toevoegen aan \(label)" }
    if localeTag.hasPrefix("tr") { return "\(label) içine ekle" }
    if localeTag.hasPrefix("cs") { return "Přidat do \(label)" }
    if localeTag.hasPrefix("hu") { return "Hozzáadás ide: \(label)" }
    if localeTag.hasPrefix("ro") { return "Adaugă în \(label)" }
    if localeTag.hasPrefix("el") { return "Προσθήκη στο \(label)" }
    if localeTag.hasPrefix("id") { return "Tambah di \(label)" }
    if localeTag.hasPrefix("vi") { return "Thêm vào \(label)" }
    if localeTag.hasPrefix("ko") { return "\(label)에 추가" }
    if localeTag.hasPrefix("uk") { return "Додати до \(label)" }
    if localeTag.hasPrefix("ru") { return "Добавить в \(label)" }
    if localeTag.hasPrefix("ar") { return "إضافة في \(label)" }

    return "Add in \(label)"
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

@objc(CloudSyncBridge)
final class CloudSyncBridge: RCTEventEmitter {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [
      CloudSyncCoordinator.EventName.statusChanged,
      CloudSyncCoordinator.EventName.remoteSnapshotApplied,
    ]
  }

  override init() {
    super.init()
    Task { @MainActor in
      CloudSyncCoordinator.shared.attachEmitter(self)
    }
  }

  override func startObserving() {
    Task { @MainActor in
      CloudSyncCoordinator.shared.attachEmitter(self)
      CloudSyncCoordinator.shared.setHasListeners(true)
    }
  }

  override func stopObserving() {
    Task { @MainActor in
      CloudSyncCoordinator.shared.setHasListeners(false)
    }
  }

  @objc(getStatus:rejecter:)
  func getStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      resolve(await CloudSyncCoordinator.shared.statusDictionary())
    }
  }

  @objc(setEnabled:resolver:rejecter:)
  func setEnabled(
    _ enabled: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      resolve(await CloudSyncCoordinator.shared.setEnabled(enabled.boolValue))
    }
  }

  @objc(syncNow:rejecter:)
  func syncNow(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      resolve(await CloudSyncCoordinator.shared.syncNow(reason: .manual))
    }
  }
}

enum CloudSyncReason: String {
  case launch
  case activate
  case background
  case enable
  case manual
  case remotePush
}

private struct LocalCloudSnapshot {
  let data: Data
  let savedAt: Int64
  let schemaVersion: Int64
  let signature: String
}

private struct RemoteCloudSnapshot {
  let record: CKRecord?
  let data: Data
  let savedAt: Int64
  let signature: String
}

private struct CloudSyncOutcome {
  let didPullRemote: Bool
  let didPushLocal: Bool
}

@MainActor
final class CloudSyncCoordinator: NSObject {
  enum EventName {
    static let statusChanged = "cloudSyncStatusChanged"
    static let remoteSnapshotApplied = "cloudSyncRemoteSnapshotApplied"
  }

  private enum DefaultsKey {
    static let enabled = "reminds.cloudSync.enabled.v1"
    static let backend = "reminds.cloudSync.backend.v1"
    static let deviceId = "reminds.cloudSync.deviceId.v1"
    static let lastSyncAt = "reminds.cloudSync.lastSyncAt.v1"
    static let lastPushAt = "reminds.cloudSync.lastPushAt.v1"
    static let lastPullAt = "reminds.cloudSync.lastPullAt.v1"
    static let lastError = "reminds.cloudSync.lastError.v1"
    static let lastErrorIsTransient = "reminds.cloudSync.lastErrorIsTransient.v1"
    static let lastKnownLocalSavedAt = "reminds.cloudSync.lastKnownLocalSavedAt.v1"
    static let lastKnownRemoteSavedAt = "reminds.cloudSync.lastKnownRemoteSavedAt.v1"
    static let lastAccountStatus = "reminds.cloudSync.lastAccountStatus.v1"
  }

  private enum RecordConfig {
    static let type = "RemindsSyncSnapshot"
    static let name = "primary"
    static let subscriptionId = "reminds-cloud-sync-v1"
    static let payloadAsset = "payloadAsset"
    static let savedAt = "savedAt"
    static let schemaVersion = "schemaVersion"
    static let signature = "signature"
    static let deviceId = "deviceId"
  }

  private enum UbiquitousConfig {
    static let payloadData = "reminds.cloudSync.payload.v1"
    static let savedAt = "reminds.cloudSync.savedAt.v1"
    static let schemaVersion = "reminds.cloudSync.schemaVersion.v1"
    static let signature = "reminds.cloudSync.signature.v1"
    static let deviceId = "reminds.cloudSync.deviceId.v1"
    static let maxPayloadBytes = 950_000
  }

  private enum SyncBackend: String {
    case cloudKit
    case iCloudKeyValue
  }

  private enum FileConfig {
    static let localSnapshotName = "reminds.tasks.v1.json"
  }

  static let shared = CloudSyncCoordinator()

  private let defaults = UserDefaults.standard
  private let ubiquitousStore = NSUbiquitousKeyValueStore.default
  private weak var emitter: CloudSyncBridge?
  private var hasListeners = false
  private var hasStarted = false
  private var isSyncing = false

  private override init() {
    super.init()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  private var isEnabled: Bool {
    defaults.bool(forKey: DefaultsKey.enabled)
  }

  private var syncBackend: SyncBackend {
    get {
      guard
        let rawValue = defaults.string(forKey: DefaultsKey.backend),
        let backend = SyncBackend(rawValue: rawValue)
      else {
        return .cloudKit
      }
      return backend
    }
    set {
      defaults.set(newValue.rawValue, forKey: DefaultsKey.backend)
    }
  }

  private var cloudContainerIdentifier: String {
    let bundleIdentifier = Bundle.main.bundleIdentifier ?? "com.anonymous.reminds"
    return "iCloud.\(bundleIdentifier)"
  }

  private var container: CKContainer {
    CKContainer(identifier: cloudContainerIdentifier)
  }

  private var database: CKDatabase {
    container.privateCloudDatabase
  }

  private var recordID: CKRecord.ID {
    CKRecord.ID(recordName: RecordConfig.name)
  }

  private var deviceId: String {
    if let existing = defaults.string(forKey: DefaultsKey.deviceId), !existing.isEmpty {
      return existing
    }

    let created = UUID().uuidString
    defaults.set(created, forKey: DefaultsKey.deviceId)
    return created
  }

  private var localSnapshotURL: URL {
    let fileManager = FileManager.default
    if let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
      return documentsURL.appendingPathComponent(FileConfig.localSnapshotName)
    }
    return fileManager.temporaryDirectory.appendingPathComponent(FileConfig.localSnapshotName)
  }

  func start() {
    guard !hasStarted else { return }
    hasStarted = true

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleUbiquitousStoreDidChange(_:)),
      name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
      object: ubiquitousStore
    )

    defaults.register(defaults: [
      DefaultsKey.lastAccountStatus: "unknown",
      DefaultsKey.backend: SyncBackend.cloudKit.rawValue,
    ])
    ubiquitousStore.synchronize()

    if isEnabled {
      enqueueSync(reason: .launch)
    } else {
      emitStatusChanged()
    }
  }

  func attachEmitter(_ emitter: CloudSyncBridge) {
    self.emitter = emitter
  }

  func setHasListeners(_ hasListeners: Bool) {
    self.hasListeners = hasListeners
    if hasListeners {
      emitStatusChanged()
    }
  }

  func setEnabled(_ enabled: Bool) async -> [String: Any] {
    defaults.set(enabled, forKey: DefaultsKey.enabled)
    if enabled {
      UIApplication.shared.registerForRemoteNotifications()
      return await syncNow(reason: .enable)
    }

    syncBackend = .cloudKit
    clearLastError()
    emitStatusChanged()
    return await statusDictionary()
  }

  func syncNow(reason: CloudSyncReason) async -> [String: Any] {
    let outcome = await performSync(reason: reason)
    var status = await statusDictionary()
    status["didPullRemote"] = outcome.didPullRemote
    status["didPushLocal"] = outcome.didPushLocal
    return status
  }

  func canHandleRemoteNotification(userInfo: [AnyHashable: Any]) -> Bool {
    guard syncBackend == .cloudKit else {
      return false
    }
    guard let notification = CKNotification(fromRemoteNotificationDictionary: userInfo) else {
      return false
    }
    return notification.subscriptionID == RecordConfig.subscriptionId
  }

  func handleRemoteNotification(userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
    guard isEnabled else { return .noData }
    let outcome = await performSync(reason: .remotePush)
    return outcome.didPullRemote || outcome.didPushLocal ? .newData : .noData
  }

  func statusDictionary(refreshAccountStatus: Bool = true) async -> [String: Any] {
    var accountStatusLabel = defaults.string(forKey: DefaultsKey.lastAccountStatus) ?? "unknown"
    if refreshAccountStatus {
      let accountStatus = await fetchAccountStatus()
      accountStatusLabel = label(for: accountStatus)
      defaults.set(accountStatusLabel, forKey: DefaultsKey.lastAccountStatus)
    }

    if accountStatusLabel == "available" && defaults.bool(forKey: DefaultsKey.lastErrorIsTransient) {
      accountStatusLabel = "temporarilyUnavailable"
    }

    return [
      "isSupported": true,
      "isEnabled": isEnabled,
      "isSyncing": isSyncing,
      "accountStatus": accountStatusLabel,
      "lastSyncAt": boxedNumber(for: DefaultsKey.lastSyncAt),
      "lastPushAt": boxedNumber(for: DefaultsKey.lastPushAt),
      "lastPullAt": boxedNumber(for: DefaultsKey.lastPullAt),
      "lastKnownLocalSavedAt": boxedNumber(for: DefaultsKey.lastKnownLocalSavedAt),
      "lastKnownRemoteSavedAt": boxedNumber(for: DefaultsKey.lastKnownRemoteSavedAt),
      "lastError": defaults.string(forKey: DefaultsKey.lastError) ?? NSNull(),
      "containerIdentifier": cloudContainerIdentifier,
      "syncBackend": syncBackend.rawValue,
    ]
  }

  @objc private func handleDidBecomeActive() {
    guard isEnabled else { return }
    enqueueSync(reason: .activate)
  }

  @objc private func handleDidEnterBackground() {
    guard isEnabled else { return }

    var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "CloudSyncBackground") {
      guard backgroundTaskId != .invalid else { return }
      UIApplication.shared.endBackgroundTask(backgroundTaskId)
      backgroundTaskId = .invalid
    }

    Task { @MainActor in
      _ = await syncNow(reason: .background)
      guard backgroundTaskId != .invalid else { return }
      UIApplication.shared.endBackgroundTask(backgroundTaskId)
      backgroundTaskId = .invalid
    }
  }

  @objc private func handleUbiquitousStoreDidChange(_ notification: Notification) {
    guard isEnabled, syncBackend == .iCloudKeyValue else { return }

    let userInfo = notification.userInfo ?? [:]
    let rawReason = userInfo[NSUbiquitousKeyValueStoreChangeReasonKey] as? NSNumber
    let reason = rawReason?.intValue ?? NSUbiquitousKeyValueStoreServerChange
    switch reason {
    case NSUbiquitousKeyValueStoreServerChange, NSUbiquitousKeyValueStoreInitialSyncChange:
      break
    default:
      return
    }

    guard let changedKeys = userInfo[NSUbiquitousKeyValueStoreChangedKeysKey] as? [String] else {
      enqueueSync(reason: .remotePush)
      return
    }

    let relevantKeys = Set([
      UbiquitousConfig.payloadData,
      UbiquitousConfig.savedAt,
      UbiquitousConfig.signature,
    ])
    guard changedKeys.contains(where: { relevantKeys.contains($0) }) else {
      return
    }

    enqueueSync(reason: .remotePush)
  }

  private func enqueueSync(reason: CloudSyncReason) {
    Task { @MainActor in
      _ = await syncNow(reason: reason)
    }
  }

  private func performSync(reason: CloudSyncReason) async -> CloudSyncOutcome {
    guard isEnabled else {
      return CloudSyncOutcome(didPullRemote: false, didPushLocal: false)
    }

    if isSyncing {
      return CloudSyncOutcome(didPullRemote: false, didPushLocal: false)
    }

    isSyncing = true
    emitStatusChanged()

    defer {
      isSyncing = false
      emitStatusChanged()
    }

    let accountStatus = await fetchAccountStatus()
    let accountStatusLabel = label(for: accountStatus)
    defaults.set(accountStatusLabel, forKey: DefaultsKey.lastAccountStatus)

    guard accountStatus == .available else {
      clearLastError()
      return CloudSyncOutcome(didPullRemote: false, didPushLocal: false)
    }

    let initialBackend = syncBackend

    do {
      let outcome = try await syncLocalAndRemote(backend: initialBackend)
      defaults.set(currentTimestampMs(), forKey: DefaultsKey.lastSyncAt)

      if syncBackend == .cloudKit {
        do {
          try await ensureSubscriptionIfPossible()
          clearLastError()
        } catch {
          rememberError(error)
        }
      } else {
        clearLastError()
      }

      return outcome
    } catch {
      if initialBackend == .cloudKit, isMissingProductionSchemaError(error) {
        syncBackend = .iCloudKeyValue
        do {
          let outcome = try await syncLocalAndRemote(backend: .iCloudKeyValue)
          defaults.set(currentTimestampMs(), forKey: DefaultsKey.lastSyncAt)
          clearLastError()
          return outcome
        } catch {
          rememberError(error)
          if reason == .manual || reason == .enable {
            emitStatusChanged()
          }
          return CloudSyncOutcome(didPullRemote: false, didPushLocal: false)
        }
      }

      rememberError(error)
      if reason == .manual || reason == .enable {
        emitStatusChanged()
      }
      return CloudSyncOutcome(didPullRemote: false, didPushLocal: false)
    }
  }

  private func syncLocalAndRemote(backend: SyncBackend) async throws -> CloudSyncOutcome {
    let localSnapshot = readLocalSnapshot()
    var effectiveBackend = backend
    var remoteSnapshot = try await fetchRemoteSnapshot(backend: effectiveBackend)

    // If CloudKit has no record but another device already switched to the
    // iCloud key-value fallback, follow that source to keep multi-device sync working.
    if effectiveBackend == .cloudKit, remoteSnapshot == nil,
      let ubiquitousRemote = fetchRemoteSnapshotFromUbiquitousStore()
    {
      effectiveBackend = .iCloudKeyValue
      syncBackend = .iCloudKeyValue
      remoteSnapshot = ubiquitousRemote
    }

    switch (localSnapshot, remoteSnapshot) {
    case (nil, nil):
      return CloudSyncOutcome(didPullRemote: false, didPushLocal: false)

    case let (local?, nil):
      try await uploadLocalSnapshot(local, existingRecord: nil, backend: effectiveBackend)
      return CloudSyncOutcome(didPullRemote: false, didPushLocal: true)

    case let (nil, remote?):
      try writeRemoteSnapshotLocally(remote)
      return CloudSyncOutcome(didPullRemote: true, didPushLocal: false)

    case let (local?, remote?):
      if remote.savedAt > local.savedAt {
        try writeRemoteSnapshotLocally(remote)
        return CloudSyncOutcome(didPullRemote: true, didPushLocal: false)
      }

      if local.savedAt > remote.savedAt {
        try await uploadLocalSnapshot(
          local,
          existingRecord: remote.record,
          backend: effectiveBackend
        )
        return CloudSyncOutcome(didPullRemote: false, didPushLocal: true)
      }

      if local.signature == remote.signature {
        defaults.set(local.savedAt, forKey: DefaultsKey.lastKnownLocalSavedAt)
        defaults.set(remote.savedAt, forKey: DefaultsKey.lastKnownRemoteSavedAt)
        return CloudSyncOutcome(didPullRemote: false, didPushLocal: false)
      }

      try writeRemoteSnapshotLocally(remote)
      return CloudSyncOutcome(didPullRemote: true, didPushLocal: false)
    }
  }

  private func ensureSubscription() async throws {
    let subscription = CKQuerySubscription(
      recordType: RecordConfig.type,
      predicate: NSPredicate(value: true),
      subscriptionID: RecordConfig.subscriptionId,
      options: [.firesOnRecordCreation, .firesOnRecordUpdate]
    )
    let notificationInfo = CKSubscription.NotificationInfo()
    notificationInfo.shouldSendContentAvailable = true
    subscription.notificationInfo = notificationInfo
    _ = try await saveSubscription(subscription)
  }

  private func ensureSubscriptionIfPossible() async throws {
    guard syncBackend == .cloudKit else {
      return
    }

    if readLocalSnapshot() != nil {
      try await ensureSubscription()
      return
    }

    guard try await fetchRemoteSnapshotFromCloudKit() != nil else {
      return
    }

    try await ensureSubscription()
  }

  private func readLocalSnapshot() -> LocalCloudSnapshot? {
    guard FileManager.default.fileExists(atPath: localSnapshotURL.path) else {
      return nil
    }

    do {
      let data = try Data(contentsOf: localSnapshotURL)
      guard
        let jsonObject = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      else {
        return nil
      }

      let savedAt = extractSavedAt(from: jsonObject)
      let schemaVersion = extractSchemaVersion(from: jsonObject)
      return LocalCloudSnapshot(
        data: data,
        savedAt: savedAt,
        schemaVersion: schemaVersion,
        signature: sha256Hex(for: data)
      )
    } catch {
      return nil
    }
  }

  private func fetchRemoteSnapshot(backend: SyncBackend) async throws -> RemoteCloudSnapshot? {
    switch backend {
    case .cloudKit:
      return try await fetchRemoteSnapshotFromCloudKit()
    case .iCloudKeyValue:
      return fetchRemoteSnapshotFromUbiquitousStore()
    }
  }

  private func fetchRemoteSnapshotFromCloudKit() async throws -> RemoteCloudSnapshot? {
    guard let record = try await fetchRecord(recordID) else {
      return nil
    }

    guard
      let asset = record[RecordConfig.payloadAsset] as? CKAsset,
      let fileURL = asset.fileURL
    else {
      return nil
    }

    let data = try Data(contentsOf: fileURL)
    let savedAt = (record[RecordConfig.savedAt] as? NSNumber)?.int64Value ?? 0
    let signature = (record[RecordConfig.signature] as? String) ?? sha256Hex(for: data)

    return RemoteCloudSnapshot(
      record: record,
      data: data,
      savedAt: savedAt,
      signature: signature
    )
  }

  private func uploadLocalSnapshot(
    _ snapshot: LocalCloudSnapshot,
    existingRecord: CKRecord?,
    backend: SyncBackend
  ) async throws {
    switch backend {
    case .cloudKit:
      try await uploadLocalSnapshotToCloudKit(snapshot, existingRecord: existingRecord)
    case .iCloudKeyValue:
      try uploadLocalSnapshotToUbiquitousStore(snapshot)
    }
  }

  private func uploadLocalSnapshotToCloudKit(
    _ snapshot: LocalCloudSnapshot,
    existingRecord: CKRecord?
  ) async throws {
    let assetURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("reminds-cloud-sync-\(UUID().uuidString).json")
    try snapshot.data.write(to: assetURL, options: .atomic)

    let record = existingRecord ?? CKRecord(recordType: RecordConfig.type, recordID: recordID)
    record[RecordConfig.payloadAsset] = CKAsset(fileURL: assetURL)
    record[RecordConfig.savedAt] = NSNumber(value: snapshot.savedAt)
    record[RecordConfig.schemaVersion] = NSNumber(value: snapshot.schemaVersion)
    record[RecordConfig.signature] = snapshot.signature as NSString
    record[RecordConfig.deviceId] = deviceId as NSString

    defer {
      try? FileManager.default.removeItem(at: assetURL)
    }

    _ = try await saveRecord(record)
    defaults.set(currentTimestampMs(), forKey: DefaultsKey.lastPushAt)
    defaults.set(snapshot.savedAt, forKey: DefaultsKey.lastKnownLocalSavedAt)
    defaults.set(snapshot.savedAt, forKey: DefaultsKey.lastKnownRemoteSavedAt)
  }

  private func fetchRemoteSnapshotFromUbiquitousStore() -> RemoteCloudSnapshot? {
    _ = ubiquitousStore.synchronize()

    guard let data = ubiquitousStore.data(forKey: UbiquitousConfig.payloadData), !data.isEmpty else {
      return nil
    }

    let savedAt = (ubiquitousStore.object(forKey: UbiquitousConfig.savedAt) as? NSNumber)?.int64Value ?? 0
    let signature = (ubiquitousStore.string(forKey: UbiquitousConfig.signature) ?? "").trimmingCharacters(
      in: .whitespacesAndNewlines
    )

    return RemoteCloudSnapshot(
      record: nil,
      data: data,
      savedAt: savedAt,
      signature: signature.isEmpty ? sha256Hex(for: data) : signature
    )
  }

  private func uploadLocalSnapshotToUbiquitousStore(_ snapshot: LocalCloudSnapshot) throws {
    if snapshot.data.count > UbiquitousConfig.maxPayloadBytes {
      let message = "Die Sync-Daten sind aktuell zu gross fuer den iCloud Key-Value Fallback. Bitte CloudKit-Schema in Production deployen."
      throw NSError(
        domain: "CloudSyncCoordinator",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: message]
      )
    }

    ubiquitousStore.set(snapshot.data, forKey: UbiquitousConfig.payloadData)
    ubiquitousStore.set(NSNumber(value: snapshot.savedAt), forKey: UbiquitousConfig.savedAt)
    ubiquitousStore.set(NSNumber(value: snapshot.schemaVersion), forKey: UbiquitousConfig.schemaVersion)
    ubiquitousStore.set(snapshot.signature, forKey: UbiquitousConfig.signature)
    ubiquitousStore.set(deviceId, forKey: UbiquitousConfig.deviceId)

    guard ubiquitousStore.synchronize() else {
      throw NSError(
        domain: "CloudSyncCoordinator",
        code: 4,
        userInfo: [NSLocalizedDescriptionKey: "iCloud Key-Value Sync konnte nicht abgeschlossen werden."]
      )
    }

    defaults.set(currentTimestampMs(), forKey: DefaultsKey.lastPushAt)
    defaults.set(snapshot.savedAt, forKey: DefaultsKey.lastKnownLocalSavedAt)
    defaults.set(snapshot.savedAt, forKey: DefaultsKey.lastKnownRemoteSavedAt)
  }

  private func writeRemoteSnapshotLocally(_ snapshot: RemoteCloudSnapshot) throws {
    try snapshot.data.write(to: localSnapshotURL, options: .atomic)
    defaults.set(currentTimestampMs(), forKey: DefaultsKey.lastPullAt)
    defaults.set(snapshot.savedAt, forKey: DefaultsKey.lastKnownLocalSavedAt)
    defaults.set(snapshot.savedAt, forKey: DefaultsKey.lastKnownRemoteSavedAt)
    emitRemoteSnapshotApplied(savedAt: snapshot.savedAt)
  }

  private func fetchAccountStatus() async -> CKAccountStatus {
    await withCheckedContinuation { continuation in
      container.accountStatus { status, _ in
        continuation.resume(returning: status)
      }
    }
  }

  private func fetchRecord(_ recordID: CKRecord.ID) async throws -> CKRecord? {
    try await withCheckedThrowingContinuation { continuation in
      database.fetch(withRecordID: recordID) { record, error in
        if let ckError = error as? CKError, ckError.code == .unknownItem {
          continuation.resume(returning: nil)
          return
        }

        if let error {
          continuation.resume(throwing: error)
          return
        }

        continuation.resume(returning: record)
      }
    }
  }

  private func saveRecord(_ record: CKRecord) async throws -> CKRecord {
    try await withCheckedThrowingContinuation { continuation in
      database.save(record) { savedRecord, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }

        guard let savedRecord else {
          continuation.resume(throwing: NSError(
            domain: "CloudSyncCoordinator",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "CloudKit record save returned no record."]
          ))
          return
        }

        continuation.resume(returning: savedRecord)
      }
    }
  }

  private func saveSubscription(_ subscription: CKSubscription) async throws -> CKSubscription {
    try await withCheckedThrowingContinuation { continuation in
      database.save(subscription) { savedSubscription, error in
        if let error {
          continuation.resume(throwing: error)
          return
        }

        guard let savedSubscription else {
          continuation.resume(throwing: NSError(
            domain: "CloudSyncCoordinator",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "CloudKit subscription save returned no subscription."]
          ))
          return
        }

        continuation.resume(returning: savedSubscription)
      }
    }
  }

  private func rememberError(_ error: Error) {
    defaults.set(errorMessage(for: error), forKey: DefaultsKey.lastError)
    defaults.set(isTransient(error: error), forKey: DefaultsKey.lastErrorIsTransient)
  }

  private func clearLastError() {
    defaults.removeObject(forKey: DefaultsKey.lastError)
    defaults.removeObject(forKey: DefaultsKey.lastErrorIsTransient)
  }

  private func emitStatusChanged() {
    guard hasListeners, let emitter else { return }
    Task { @MainActor in
      emitter.sendEvent(
        withName: EventName.statusChanged,
        body: await statusDictionary(refreshAccountStatus: false)
      )
    }
  }

  private func emitRemoteSnapshotApplied(savedAt: Int64) {
    guard hasListeners, let emitter else { return }
    emitter.sendEvent(
      withName: EventName.remoteSnapshotApplied,
      body: ["savedAt": NSNumber(value: savedAt)]
    )
    emitStatusChanged()
  }

  private func boxedNumber(for key: String) -> Any {
    guard let value = defaults.object(forKey: key) as? NSNumber else {
      return NSNull()
    }
    return value
  }

  private func currentTimestampMs() -> NSNumber {
    NSNumber(value: Int64(Date().timeIntervalSince1970 * 1000))
  }

  private func extractSavedAt(from jsonObject: [String: Any]) -> Int64 {
    if let savedAt = jsonObject["savedAt"] as? NSNumber {
      return savedAt.int64Value
    }
    if let savedAt = jsonObject["savedAt"] as? Double {
      return Int64(savedAt)
    }
    return 0
  }

  private func extractSchemaVersion(from jsonObject: [String: Any]) -> Int64 {
    if let schemaVersion = jsonObject["schemaVersion"] as? NSNumber {
      return schemaVersion.int64Value
    }
    if let schemaVersion = jsonObject["schemaVersion"] as? Double {
      return Int64(schemaVersion)
    }
    return 1
  }

  private func sha256Hex(for data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private func label(for accountStatus: CKAccountStatus) -> String {
    switch accountStatus {
    case .available:
      return "available"
    case .noAccount:
      return "noAccount"
    case .restricted:
      return "restricted"
    case .couldNotDetermine:
      return "couldNotDetermine"
    @unknown default:
      return "unknown"
    }
  }

  private func isTransient(error: Error) -> Bool {
    guard let ckError = error as? CKError else { return false }
    switch ckError.code {
    case .networkFailure, .networkUnavailable, .serviceUnavailable, .requestRateLimited, .zoneBusy:
      return true
    default:
      return false
    }
  }

  private func isMissingProductionSchemaError(_ error: Error) -> Bool {
    if let ckError = error as? CKError {
      return isMissingProductionSchemaError(ckError)
    }

    let loweredDescription = error.localizedDescription.lowercased()
    return loweredDescription.contains("cannot create new type")
      && loweredDescription.contains(RecordConfig.type.lowercased())
      && loweredDescription.contains("production schema")
  }

  private func isMissingProductionSchemaError(_ error: CKError) -> Bool {
    let detailCandidates: [String] = [
      cloudKitFailureDetail(for: error) ?? "",
      error.localizedDescription,
    ]

    let details = detailCandidates.joined(separator: " ").lowercased()
    if details.contains("cannot create new type")
      && details.contains(RecordConfig.type.lowercased())
      && details.contains("production schema")
    {
      return true
    }

    if let partialErrors = error.userInfo[CKPartialErrorsByItemIDKey] as? [AnyHashable: Any] {
      for partial in partialErrors.values {
        if let partialError = partial as? CKError, isMissingProductionSchemaError(partialError) {
          return true
        }
        if let partialError = partial as? Error, isMissingProductionSchemaError(partialError) {
          return true
        }
      }
    }

    return false
  }

  private func errorMessage(for error: Error) -> String {
    guard let ckError = error as? CKError else {
      return error.localizedDescription
    }

    switch ckError.code {
    case .networkFailure, .networkUnavailable, .serviceUnavailable, .requestRateLimited, .zoneBusy:
      return "iCloud ist gerade nicht erreichbar."
    case .notAuthenticated:
      return "Bitte melde dich in den iOS Einstellungen bei iCloud an."
    case .permissionFailure:
      return "Der Zugriff auf CloudKit ist fuer diese App noch nicht freigeschaltet."
    case .missingEntitlement:
      return "Der App fehlt die iCloud- oder CloudKit-Berechtigung im Signaturprofil."
    case .badContainer:
      return "Der konfigurierte iCloud-Container passt nicht zum Bundle Identifier oder ist im Apple Developer Portal noch nicht freigeschaltet."
    case .serverRejectedRequest:
      if let detail = cloudKitFailureDetail(for: ckError) {
        return "CloudKit hat die Anfrage abgelehnt: \(detail)"
      }
      return "CloudKit hat die Anfrage abgelehnt. In TestFlight- oder Release-Builds ist meist das CloudKit-Schema noch nicht in Production deployed."
    case .badDatabase:
      return "Die CloudKit-Datenbank hat diese Anfrage abgelehnt."
    case .quotaExceeded:
      return "Der verfuegbare iCloud-Speicher reicht fuer den Sync gerade nicht aus."
    default:
      if let detail = cloudKitFailureDetail(for: ckError) {
        return detail
      }
      return ckError.localizedDescription
    }
  }

  private func cloudKitFailureDetail(for error: CKError) -> String? {
    if let failureReason = error.userInfo[NSLocalizedFailureReasonErrorKey] as? String {
      let trimmed = failureReason.trimmingCharacters(in: .whitespacesAndNewlines)
      if !trimmed.isEmpty {
        return trimmed
      }
    }

    if let underlyingError = error.userInfo[NSUnderlyingErrorKey] as? NSError {
      if let failureReason = underlyingError.userInfo[NSLocalizedFailureReasonErrorKey] as? String {
        let trimmed = failureReason.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
          return trimmed
        }
      }

      let description = underlyingError.localizedDescription.trimmingCharacters(
        in: .whitespacesAndNewlines
      )
      if !description.isEmpty && description != error.localizedDescription {
        return description
      }
    }

    return nil
  }
}
