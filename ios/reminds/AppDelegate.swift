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

private extension Notification.Name {
  static let taskAccessoryContextDidChange = Notification.Name("TaskAccessoryContextDidChange")
}

@objc(TaskAccessoryContextBridge)
final class TaskAccessoryContextBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(setContext:projectId:projectLabel:)
  func setContext(_ mode: String, projectId: String?, projectLabel: String?) {
    DispatchQueue.main.async {
      NotificationCenter.default.post(
        name: .taskAccessoryContextDidChange,
        object: nil,
        userInfo: [
          "mode": mode,
          "projectId": projectId ?? "",
          "projectLabel": projectLabel ?? "",
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

  @objc private func handleAccessoryContextDidChange(_ notification: Notification) {
    guard let userInfo = notification.userInfo else {
      return
    }

    let rawMode = (userInfo["mode"] as? String) ?? ""
    let mode = AddReminderAccessoryButton.Mode(rawValue: rawMode) ?? .task

    let rawProjectId = (userInfo["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let rawProjectLabel = (userInfo["projectLabel"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)

    accessoryMode = mode
    accessoryProjectId = (rawProjectId?.isEmpty == false) ? rawProjectId : nil
    accessoryProjectLabel = (rawProjectLabel?.isEmpty == false) ? rawProjectLabel : nil

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
    switch accessoryMode {
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
    case project
    case inProject
  }

  private var currentMode: Mode = .task
  private var currentTitle = AddReminderAccessoryButton.localizedTaskTitle()
  private let accentBlue = UIColor(red: 10.0 / 255.0, green: 132.0 / 255.0, blue: 1.0, alpha: 1)
  private let accentBlueTranslucent = UIColor(red: 10.0 / 255.0, green: 132.0 / 255.0, blue: 1.0, alpha: 0.46)
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
    view.tintColor = accentBlue
    view.isUserInteractionEnabled = false
    return view
  }()

  private lazy var titleTextLabel: UILabel = {
    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = currentTitle
    label.textColor = accentBlue
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
    let contentColor = isDark ? UIColor.white : accentBlue
    iconView.tintColor = contentColor
    titleTextLabel.textColor = contentColor
    tintOverlayView.backgroundColor = isDark ? accentBlueTranslucent : .clear
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
      titleTextLabel.alpha = 1
      titleTextLabel.transform = .identity
      return
    }

    UIView.animate(
      withDuration: 0.12,
      delay: 0,
      options: [.curveEaseIn, .beginFromCurrentState],
      animations: {
        self.titleTextLabel.alpha = 0
        self.titleTextLabel.transform = CGAffineTransform(translationX: 0, y: -3)
      },
      completion: { _ in
        applyTitle()
        self.titleTextLabel.transform = CGAffineTransform(translationX: 0, y: 3)
        UIView.animate(
          withDuration: 0.18,
          delay: 0,
          options: [.curveEaseOut, .beginFromCurrentState],
          animations: {
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
    if localeTag.hasPrefix("es") { return "Añadir tarea" }
    if localeTag.hasPrefix("fr") { return "Ajouter une tâche" }
    if localeTag.hasPrefix("pt") { return "Adicionar tarefa" }
    if localeTag.hasPrefix("hi") { return "कार्य जोड़ें" }
    if localeTag.hasPrefix("zh") { return "添加任务" }
    if localeTag.hasPrefix("ja") { return "タスクを追加" }

    return "Add task"
  }

  private static func localizedProjectTitle() -> String {
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()

    if localeTag.hasPrefix("de") { return "Projekt hinzufügen" }
    if localeTag.hasPrefix("es") { return "Añadir proyecto" }
    if localeTag.hasPrefix("fr") { return "Ajouter un projet" }
    if localeTag.hasPrefix("pt") { return "Adicionar projeto" }
    if localeTag.hasPrefix("hi") { return "प्रोजेक्ट जोड़ें" }
    if localeTag.hasPrefix("zh") { return "添加项目" }
    if localeTag.hasPrefix("ja") { return "プロジェクトを追加" }

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

    return "Project"
  }

  private static func localizedInProjectTitle(_ label: String) -> String {
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()

    if localeTag.hasPrefix("de") { return "In \(label) hinzufügen" }
    if localeTag.hasPrefix("es") { return "Añadir en \(label)" }
    if localeTag.hasPrefix("fr") { return "Ajouter dans \(label)" }
    if localeTag.hasPrefix("pt") { return "Adicionar em \(label)" }
    if localeTag.hasPrefix("hi") { return "\(label) में जोड़ें" }
    if localeTag.hasPrefix("zh") { return "添加到\(label)" }
    if localeTag.hasPrefix("ja") { return "\(label)に追加" }

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
