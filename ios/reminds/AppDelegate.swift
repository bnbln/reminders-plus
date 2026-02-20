import Expo
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
    window?.backgroundColor = UIColor.remindsAppBackground
    window?.rootViewController?.view.backgroundColor = UIColor.remindsAppBackground
    applyReactRootViewBackground()

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

  private func applyReactRootViewBackground() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard let rootView = self.findReactRootView(in: self.window) else { return }
      rootView.backgroundColor = UIColor.remindsAppBackground
      rootView.isOpaque = true
    }
  }

  private func findReactRootView(in window: UIWindow?) -> RCTRootView? {
    guard let view = window?.rootViewController?.view else { return nil }
    return findReactRootView(in: view)
  }

  private func findReactRootView(in view: UIView) -> RCTRootView? {
    if let rootView = view as? RCTRootView {
      return rootView
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

@objc(MonthYearPickerBridge)
final class MonthYearPickerBridge: NSObject, UIPopoverPresentationControllerDelegate, UIAdaptivePresentationControllerDelegate {
  private var pendingResolve: RCTPromiseResolveBlock?

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(present:monthValues:years:selectedMonthValue:selectedYearValue:anchorFrame:resolve:reject:)
  func present(
    _ monthLabels: [String],
    monthValues: [NSNumber],
    years: [NSNumber],
    selectedMonthValue: NSNumber,
    selectedYearValue: NSNumber,
    anchorFrame: NSDictionary?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }

      guard self.pendingResolve == nil else {
        reject(
          "E_MONTH_YEAR_PICKER_BUSY",
          "Month/year picker is already presented.",
          nil
        )
        return
      }

      let normalizedMonths = Self.normalizeMonths(
        monthLabels: monthLabels,
        monthValues: monthValues
      )
      let normalizedYears = years.map(\.intValue)

      guard !normalizedMonths.labels.isEmpty,
            !normalizedMonths.values.isEmpty,
            !normalizedYears.isEmpty else {
        reject(
          "E_MONTH_YEAR_PICKER_INVALID_OPTIONS",
          "Month/year picker requires non-empty month and year options.",
          nil
        )
        return
      }

      guard let presenter = Self.topViewController() else {
        reject(
          "E_MONTH_YEAR_PICKER_NO_PRESENTER",
          "Unable to find a presenter view controller.",
          nil
        )
        return
      }

      let pickerController = MonthYearPickerPopoverViewController(
        monthLabels: normalizedMonths.labels,
        monthValues: normalizedMonths.values,
        years: normalizedYears,
        selectedMonthValue: selectedMonthValue.intValue,
        selectedYearValue: selectedYearValue.intValue
      )

      pickerController.onDone = { [weak self] monthValue, yearValue in
        self?.resolveAndCleanup([
          "monthValue": monthValue,
          "yearValue": yearValue,
        ])
      }

      pickerController.modalPresentationStyle = .popover
      pickerController.presentationController?.delegate = self
      pickerController.preferredContentSize = CGSize(width: 312, height: 286)

      if let popover = pickerController.popoverPresentationController {
        popover.delegate = self
        popover.sourceView = presenter.view
        popover.sourceRect = Self.resolveSourceRect(
          from: anchorFrame,
          in: presenter.view
        )
        popover.permittedArrowDirections = [.down, .up]
        popover.canOverlapSourceViewRect = true
        popover.backgroundColor = .clear
      }

      self.pendingResolve = resolve
      presenter.present(pickerController, animated: true)
    }
  }

  func adaptivePresentationStyle(
    for controller: UIPresentationController
  ) -> UIModalPresentationStyle {
    .none
  }

  func adaptivePresentationStyle(
    for controller: UIPresentationController,
    traitCollection: UITraitCollection
  ) -> UIModalPresentationStyle {
    .none
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    resolveAndCleanup(nil)
  }

  private func resolveAndCleanup(_ payload: Any?) {
    guard let resolve = pendingResolve else { return }
    pendingResolve = nil
    resolve(payload ?? NSNull())
  }

  private static func normalizeMonths(
    monthLabels: [String],
    monthValues: [NSNumber]
  ) -> (labels: [String], values: [Int]) {
    guard !monthLabels.isEmpty, !monthValues.isEmpty else {
      return ([], [])
    }
    let normalizedValues = monthValues.map(\.intValue)
    let count = min(monthLabels.count, normalizedValues.count)
    return (
      Array(monthLabels.prefix(count)),
      Array(normalizedValues.prefix(count))
    )
  }

  private static func resolveSourceRect(
    from anchorFrame: NSDictionary?,
    in presenterView: UIView
  ) -> CGRect {
    guard let anchorFrame else {
      let safeTop = presenterView.safeAreaInsets.top
      return CGRect(
        x: presenterView.bounds.maxX - 36,
        y: safeTop + 12,
        width: 1,
        height: 1
      )
    }

    let x = (anchorFrame["x"] as? NSNumber)?.doubleValue
    let y = (anchorFrame["y"] as? NSNumber)?.doubleValue
    let width = (anchorFrame["width"] as? NSNumber)?.doubleValue
    let height = (anchorFrame["height"] as? NSNumber)?.doubleValue

    guard let x, let y, let width, let height,
          x.isFinite, y.isFinite, width.isFinite, height.isFinite,
          width > 0, height > 0 else {
      let safeTop = presenterView.safeAreaInsets.top
      return CGRect(
        x: presenterView.bounds.maxX - 36,
        y: safeTop + 12,
        width: 1,
        height: 1
      )
    }

    let frameInWindow = CGRect(
      x: x,
      y: y,
      width: width,
      height: height
    )

    guard let window = presenterView.window else {
      return frameInWindow
    }
    return presenterView.convert(frameInWindow, from: window)
  }

  private static func topViewController() -> UIViewController? {
    let connectedWindows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
    let keyWindow = connectedWindows.first(where: \.isKeyWindow) ?? connectedWindows.first
    let root = keyWindow?.rootViewController
    return topViewController(from: root)
  }

  private static func topViewController(from root: UIViewController?) -> UIViewController? {
    guard let root else { return nil }
    if let nav = root as? UINavigationController {
      return topViewController(from: nav.visibleViewController)
    }
    if let tab = root as? UITabBarController, let selected = tab.selectedViewController {
      return topViewController(from: selected)
    }
    if let presented = root.presentedViewController {
      return topViewController(from: presented)
    }
    return root
  }
}

private final class MonthYearPickerPopoverViewController: UIViewController, UIPickerViewDataSource, UIPickerViewDelegate {
  var onDone: ((Int, Int) -> Void)?

  private let monthLabels: [String]
  private let monthValues: [Int]
  private let years: [Int]
  private var selectedMonthValue: Int
  private var selectedYearValue: Int
  private let surfaceView = MonthYearPickerPopoverViewController.makeSurfaceView()
  private let pickerView = UIPickerView()
  private let titleLabel = UILabel()

  init(
    monthLabels: [String],
    monthValues: [Int],
    years: [Int],
    selectedMonthValue: Int,
    selectedYearValue: Int
  ) {
    self.monthLabels = monthLabels
    self.monthValues = monthValues
    self.years = years
    self.selectedMonthValue = selectedMonthValue
    self.selectedYearValue = selectedYearValue
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    nil
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    setupUI()
    syncInitialSelection()
    refreshHeaderTitle()
  }

  private static func makeSurfaceView() -> UIVisualEffectView {
    if #available(iOS 26.0, *) {
      let glassEffect = UIGlassEffect(style: .regular)
      glassEffect.isInteractive = false
      return UIVisualEffectView(effect: glassEffect)
    }
    return UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
  }

  private func setupUI() {
    view.backgroundColor = .clear

    surfaceView.translatesAutoresizingMaskIntoConstraints = false
    surfaceView.layer.cornerRadius = 24
    surfaceView.layer.cornerCurve = .continuous
    surfaceView.layer.masksToBounds = true
    surfaceView.clipsToBounds = true
    view.addSubview(surfaceView)

    let strokeView = UIView()
    strokeView.translatesAutoresizingMaskIntoConstraints = false
    strokeView.isUserInteractionEnabled = false
    strokeView.layer.cornerRadius = 24
    strokeView.layer.cornerCurve = .continuous
    strokeView.layer.borderWidth = 1 / UIScreen.main.scale
    strokeView.layer.borderColor = UIColor.separator.withAlphaComponent(0.12).cgColor
    view.addSubview(strokeView)

    let contentView = surfaceView.contentView

    let headerView = UIView()
    headerView.translatesAutoresizingMaskIntoConstraints = false
    contentView.addSubview(headerView)

    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    titleLabel.textColor = .label
    titleLabel.font = UIFont.systemFont(ofSize: 20, weight: .bold)
    titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    headerView.addSubview(titleLabel)

    let doneButton = UIButton(type: .system)
    doneButton.translatesAutoresizingMaskIntoConstraints = false
    let localeTag = (Locale.preferredLanguages.first ?? Locale.current.identifier).lowercased()
    doneButton.setTitle(
      localeTag.hasPrefix("de") ? "Fertig" : "Done",
      for: .normal
    )
    doneButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
    doneButton.addTarget(self, action: #selector(handleDoneTap), for: .touchUpInside)
    headerView.addSubview(doneButton)

    pickerView.translatesAutoresizingMaskIntoConstraints = false
    pickerView.backgroundColor = .clear
    pickerView.dataSource = self
    pickerView.delegate = self
    contentView.addSubview(pickerView)

    NSLayoutConstraint.activate([
      surfaceView.topAnchor.constraint(equalTo: view.topAnchor),
      surfaceView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      surfaceView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      surfaceView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

      strokeView.topAnchor.constraint(equalTo: view.topAnchor),
      strokeView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      strokeView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      strokeView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

      headerView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 16),
      headerView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 18),
      headerView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),

      titleLabel.leadingAnchor.constraint(equalTo: headerView.leadingAnchor),
      titleLabel.centerYAnchor.constraint(equalTo: doneButton.centerYAnchor),
      titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: doneButton.leadingAnchor, constant: -8),

      doneButton.topAnchor.constraint(equalTo: headerView.topAnchor),
      doneButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor),
      doneButton.bottomAnchor.constraint(equalTo: headerView.bottomAnchor),

      pickerView.topAnchor.constraint(equalTo: headerView.bottomAnchor, constant: 6),
      pickerView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 6),
      pickerView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -6),
      pickerView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -10),
    ])
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    clearPickerSelectionSolidOverlay()
  }

  private func clearPickerSelectionSolidOverlay() {
    for subview in pickerView.subviews {
      if subview.bounds.height > 1 {
        subview.backgroundColor = .clear
      } else {
        subview.backgroundColor = UIColor.separator.withAlphaComponent(0.08)
      }
    }
  }

  private func syncInitialSelection() {
    let monthRow = monthValues.firstIndex(of: selectedMonthValue) ?? 0
    let yearRow = years.firstIndex(of: selectedYearValue) ?? 0
    pickerView.selectRow(monthRow, inComponent: 0, animated: false)
    pickerView.selectRow(yearRow, inComponent: 1, animated: false)
    selectedMonthValue = monthValues[min(max(monthRow, 0), monthValues.count - 1)]
    selectedYearValue = years[min(max(yearRow, 0), years.count - 1)]
  }

  private func refreshHeaderTitle() {
    let monthRow = max(0, min(pickerView.selectedRow(inComponent: 0), monthLabels.count - 1))
    let yearRow = max(0, min(pickerView.selectedRow(inComponent: 1), years.count - 1))
    let month = monthLabels[monthRow]
    let year = years[yearRow]
    titleLabel.text = "\(month) \(year)"
  }

  @objc private func handleDoneTap() {
    let monthRow = max(0, min(pickerView.selectedRow(inComponent: 0), monthValues.count - 1))
    let yearRow = max(0, min(pickerView.selectedRow(inComponent: 1), years.count - 1))
    let month = monthValues[monthRow]
    let year = years[yearRow]
    onDone?(month, year)
    dismiss(animated: true)
  }

  func numberOfComponents(in pickerView: UIPickerView) -> Int {
    2
  }

  func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
    component == 0 ? monthLabels.count : years.count
  }

  func pickerView(
    _ pickerView: UIPickerView,
    rowHeightForComponent component: Int
  ) -> CGFloat {
    44
  }

  func pickerView(
    _ pickerView: UIPickerView,
    widthForComponent component: Int
  ) -> CGFloat {
    let totalWidth = max(view.bounds.width, 1)
    return component == 0 ? totalWidth * 0.62 : totalWidth * 0.38
  }

  func pickerView(
    _ pickerView: UIPickerView,
    titleForRow row: Int,
    forComponent component: Int
  ) -> String? {
    if component == 0 {
      guard row >= 0 && row < monthLabels.count else { return nil }
      return monthLabels[row]
    }
    guard row >= 0 && row < years.count else { return nil }
    return String(years[row])
  }

  func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
    let monthRow = max(0, min(pickerView.selectedRow(inComponent: 0), monthValues.count - 1))
    let yearRow = max(0, min(pickerView.selectedRow(inComponent: 1), years.count - 1))
    selectedMonthValue = monthValues[monthRow]
    selectedYearValue = years[yearRow]
    refreshHeaderTitle()
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
    case routine
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

@objc(MonthYearWheelPicker)
final class MonthYearWheelPicker: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    MonthYearWheelPickerView()
  }
}

private final class MonthYearWheelPickerView: UIView, UIPickerViewDataSource, UIPickerViewDelegate {
  @objc var monthLabels: [String] = [] {
    didSet {
      pickerView.reloadComponent(0)
      syncSelection(animated: false)
    }
  }

  @objc var monthValues: [NSNumber] = [] {
    didSet {
      pickerView.reloadComponent(0)
      syncSelection(animated: false)
    }
  }

  @objc var years: [NSNumber] = [] {
    didSet {
      pickerView.reloadComponent(1)
      syncSelection(animated: false)
    }
  }

  @objc var selectedMonthValue: NSNumber = 0 {
    didSet {
      syncSelection(animated: false)
    }
  }

  @objc var selectedYearValue: NSNumber = 0 {
    didSet {
      syncSelection(animated: false)
    }
  }

  @objc var onChange: RCTBubblingEventBlock?

  private let pickerView = UIPickerView()
  private var suppressChangeEvent = false

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupPicker()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setupPicker()
  }

  private func setupPicker() {
    backgroundColor = .clear
    pickerView.backgroundColor = .clear
    pickerView.translatesAutoresizingMaskIntoConstraints = false
    pickerView.dataSource = self
    pickerView.delegate = self
    addSubview(pickerView)

    NSLayoutConstraint.activate([
      pickerView.topAnchor.constraint(equalTo: topAnchor),
      pickerView.bottomAnchor.constraint(equalTo: bottomAnchor),
      pickerView.leadingAnchor.constraint(equalTo: leadingAnchor),
      pickerView.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])
  }

  private func syncSelection(animated: Bool) {
    let monthIndex = monthValues.firstIndex(where: {
      $0.intValue == selectedMonthValue.intValue
    }) ?? 0
    let yearIndex = years.firstIndex(where: {
      $0.intValue == selectedYearValue.intValue
    }) ?? 0

    suppressChangeEvent = true
    pickerView.selectRow(monthIndex, inComponent: 0, animated: animated)
    pickerView.selectRow(yearIndex, inComponent: 1, animated: animated)
    suppressChangeEvent = false
  }

  private func emitChangeIfNeeded() {
    guard !suppressChangeEvent else { return }
    guard !monthValues.isEmpty, !years.isEmpty else { return }

    let monthRow = max(0, min(pickerView.selectedRow(inComponent: 0), monthValues.count - 1))
    let yearRow = max(0, min(pickerView.selectedRow(inComponent: 1), years.count - 1))
    let monthValue = monthValues[monthRow].intValue
    let yearValue = years[yearRow].intValue

    if selectedMonthValue.intValue != monthValue {
      selectedMonthValue = NSNumber(value: monthValue)
    }
    if selectedYearValue.intValue != yearValue {
      selectedYearValue = NSNumber(value: yearValue)
    }

    onChange?([
      "monthValue": monthValue,
      "yearValue": yearValue,
    ])
  }

  func numberOfComponents(in pickerView: UIPickerView) -> Int {
    2
  }

  func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
    component == 0 ? monthValues.count : years.count
  }

  func pickerView(
    _ pickerView: UIPickerView,
    rowHeightForComponent component: Int
  ) -> CGFloat {
    44
  }

  func pickerView(
    _ pickerView: UIPickerView,
    widthForComponent component: Int
  ) -> CGFloat {
    let totalWidth = max(bounds.width, 1)
    return component == 0 ? totalWidth * 0.62 : totalWidth * 0.38
  }

  func pickerView(
    _ pickerView: UIPickerView,
    attributedTitleForRow row: Int,
    forComponent component: Int
  ) -> NSAttributedString? {
    let text: String
    if component == 0 {
      guard row >= 0 && row < monthLabels.count else { return nil }
      text = monthLabels[row]
    } else {
      guard row >= 0 && row < years.count else { return nil }
      text = String(years[row].intValue)
    }

    let textColor = UIColor { traits in
      traits.userInterfaceStyle == .dark
        ? UIColor(white: 0.94, alpha: 1.0)
        : UIColor(white: 0.10, alpha: 1.0)
    }

    return NSAttributedString(
      string: text,
      attributes: [
        .foregroundColor: textColor,
        .font: UIFont.systemFont(ofSize: 32, weight: .regular),
      ]
    )
  }

  func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
    emitChangeIfNeeded()
  }
}
