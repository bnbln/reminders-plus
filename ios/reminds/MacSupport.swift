import React
import UIKit

// Native side of the Mac version ("Designed for iPad" on Apple silicon).
// JS sends the localized titles, the project list and the profile menu; the
// sidebar, the menu bar and the keyboard shortcuts are built here from that and
// every pick goes back to JS as a `macCommand` event, where the router lives.
// Plan and decisions: docs/macos.md.

enum MacEnvironment {
  static var isiOSAppOnMac: Bool {
    ProcessInfo.processInfo.isiOSAppOnMac
  }
}

extension Notification.Name {
  static let macSidebarContentDidChange = Notification.Name("MacSidebarContentDidChange")
}

struct MacMenuEntry {
  let id: String
  let title: String
  let symbol: String?
  let color: UIColor?
  let isOn: Bool

  init?(_ raw: Any) {
    guard let dict = raw as? [String: Any],
          let id = dict["id"] as? String,
          let title = dict["title"] as? String,
          !id.isEmpty else {
      return nil
    }
    self.id = id
    self.title = title
    let symbol = dict["symbol"] as? String
    self.symbol = (symbol?.isEmpty == false) ? symbol : nil
    self.color = (dict["color"] as? String).flatMap(UIColor.init(macHex:))
    self.isOn = (dict["checked"] as? Bool) ?? false
  }

  var image: UIImage? {
    guard let symbol, let image = UIImage(systemName: symbol) else { return nil }
    guard let color else { return image }
    return image.withTintColor(color, renderingMode: .alwaysOriginal)
  }
}

/// Main-thread state shared by the bridge, the menu builder and the sidebar.
final class MacSupportStore {
  static let shared = MacSupportStore()

  private(set) var menuTitles: [String: String] = [:]
  private(set) var filterEntries: [MacMenuEntry] = []
  private(set) var projectsGroupTitle = ""
  private(set) var newProjectTitle = ""
  private(set) var profileTitle = ""
  private(set) var projects: [MacMenuEntry] = []
  private(set) var profileSections: [[MacMenuEntry]] = []
  weak var emitter: MacSupportBridge?

  func title(_ key: String) -> String? {
    guard let value = menuTitles[key], !value.isEmpty else { return nil }
    return value
  }

  func updateMenu(titles: [String: String], filters: [MacMenuEntry]) {
    menuTitles = titles
    filterEntries = filters
    UIMenuSystem.main.setNeedsRebuild()
  }

  func updateSidebar(_ content: [String: Any]) {
    projectsGroupTitle = (content["projectsGroupTitle"] as? String) ?? ""
    newProjectTitle = (content["newProjectTitle"] as? String) ?? ""
    profileTitle = (content["profileTitle"] as? String) ?? ""
    projects = ((content["projects"] as? [Any]) ?? []).compactMap(MacMenuEntry.init)
    profileSections = ((content["profileSections"] as? [Any]) ?? []).map { section in
      ((section as? [Any]) ?? []).compactMap(MacMenuEntry.init)
    }
    NotificationCenter.default.post(name: .macSidebarContentDidChange, object: nil)
  }

  func send(_ command: String, value: String? = nil) {
    emitter?.emitCommand(command, value: value)
  }
}

@objc(MacSupportBridge)
final class MacSupportBridge: RCTEventEmitter {
  static let commandEvent = "macCommand"
  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func constantsToExport() -> [AnyHashable: Any]! {
    ["isiOSAppOnMac": MacEnvironment.isiOSAppOnMac]
  }

  override func supportedEvents() -> [String]! {
    [Self.commandEvent]
  }

  override func startObserving() {
    hasListeners = true
    DispatchQueue.main.async {
      MacSupportStore.shared.emitter = self
    }
  }

  override func stopObserving() {
    hasListeners = false
  }

  func emitCommand(_ command: String, value: String?) {
    guard hasListeners else { return }
    sendEvent(withName: Self.commandEvent, body: ["command": command, "value": value ?? ""])
  }

  @objc(setMenuContent:)
  func setMenuContent(_ content: NSDictionary) {
    let titles = (content["titles"] as? [String: String]) ?? [:]
    let filters = ((content["filters"] as? [Any]) ?? []).compactMap(MacMenuEntry.init)
    DispatchQueue.main.async {
      MacSupportStore.shared.updateMenu(titles: titles, filters: filters)
    }
  }

  @objc(setSidebarContent:)
  func setSidebarContent(_ content: NSDictionary) {
    let dict = (content as? [String: Any]) ?? [:]
    DispatchQueue.main.async {
      MacSupportStore.shared.updateSidebar(dict)
    }
  }
}

// MARK: - Menu bar and keyboard shortcuts

/// Builds the menu bar on the Mac and the iPad menu bar (iPadOS 26), and with it
/// the hardware-keyboard shortcuts on iPad. Commands carry their id in
/// `propertyList` and go to `AppDelegate.handleMacMenuCommand(_:)`.
enum MacMenuBuilder {
  static let commandAction = #selector(AppDelegate.handleMacMenuCommand(_:))

  private static func command(
    _ id: String,
    titleKey: String,
    symbol: String? = nil,
    input: String? = nil,
    modifiers: UIKeyModifierFlags = .command,
    attributes: UIMenuElement.Attributes = [],
    state: UIMenuElement.State = .off
  ) -> UICommand? {
    guard let title = MacSupportStore.shared.title(titleKey) else { return nil }
    let image = symbol.flatMap { UIImage(systemName: $0) }
    let propertyList = ["id": id]
    if let input {
      let keyCommand = UIKeyCommand(
        title: title,
        image: image,
        action: commandAction,
        input: input,
        modifierFlags: modifiers,
        propertyList: propertyList
      )
      keyCommand.attributes = attributes
      keyCommand.state = state
      // No priority over the system: a text field keeps ⌘⌫, ⌘↩ and Esc while editing.
      return keyCommand
    }
    let plain = UICommand(
      title: title,
      image: image,
      action: commandAction,
      propertyList: propertyList,
      attributes: attributes,
      state: state
    )
    return plain
  }

  private static func inline(_ identifier: String, _ children: [UICommand?]) -> UIMenu {
    UIMenu(
      title: "",
      identifier: UIMenu.Identifier("com.reminders.plus.\(identifier)"),
      options: .displayInline,
      children: children.compactMap { $0 }
    )
  }

  static func build(with builder: UIMenuBuilder) {
    guard builder.system == .main else { return }
    // Titles come from JS; until they arrive keep the system menus.
    guard MacSupportStore.shared.title("newTask") != nil else { return }

    func has(_ identifier: UIMenu.Identifier) -> Bool {
      builder.menu(for: identifier) != nil
    }

    // ⌘F belongs to search here, not to the text Find panel.
    if has(.find) {
      builder.remove(menu: .find)
    }

    let settings = command("settings", titleKey: "settings", input: ",")
    if builder.menu(for: .preferences) != nil, let settings {
      builder.replaceChildren(ofMenu: .preferences) { _ in [settings] }
    } else if has(.application) {
      builder.insertChild(inline("settings", [settings]), atEndOfMenu: .application)
    }

    if has(.file) {
      builder.insertChild(
        inline("file", [
          command("newTask", titleKey: "newTask", symbol: "plus", input: "n"),
          command("newProject", titleKey: "newProject", symbol: "folder.badge.plus", input: "n", modifiers: [.command, .shift]),
          command("exportBackup", titleKey: "exportBackup", symbol: "square.and.arrow.up"),
        ]),
        atStartOfMenu: .file
      )
    }

    if has(.edit) {
      builder.insertChild(
        inline("edit", [
          command("search", titleKey: "search", symbol: "magnifyingglass", input: "f"),
          command("toggleComplete", titleKey: "toggleComplete", symbol: "checkmark.circle", input: "\r"),
          command("deleteTask", titleKey: "deleteTask", symbol: "trash", input: UIKeyCommand.inputDelete, attributes: .destructive),
          // Esc closes the create overlays; there is no on-screen keyboard to dismiss them.
          command("closeOverlay", titleKey: "closeOverlay", input: UIKeyCommand.inputEscape, modifiers: [], attributes: .hidden),
        ]),
        atEndOfMenu: .edit
      )
    }

    var viewChildren: [UIMenuElement] = [
      inline("tabs", [
        command("goToday", titleKey: "goToday", symbol: "calendar", input: "1"),
        command("goInbox", titleKey: "goInbox", symbol: "tray", input: "2"),
        command("goProjects", titleKey: "goProjects", symbol: "folder", input: "3"),
        command("goRoutines", titleKey: "goRoutines", symbol: "repeat", input: "4"),
      ]),
    ]
    if MacEnvironment.isiOSAppOnMac {
      viewChildren.append(inline("sidebar", [
        command("toggleSidebar", titleKey: "toggleSidebar", symbol: "sidebar.left", input: "s", modifiers: [.command, .control]),
      ]))
    }
    let filters = MacSupportStore.shared.filterEntries
    if !filters.isEmpty, let filterTitle = MacSupportStore.shared.title("filter") {
      let filterCommands = filters.map { entry in
        UICommand(
          title: entry.title,
          image: nil,
          action: commandAction,
          propertyList: ["id": "toggleFilter", "value": entry.id],
          state: entry.isOn ? .on : .off
        )
      }
      viewChildren.append(UIMenu(
        title: filterTitle,
        image: UIImage(systemName: "line.3.horizontal.decrease"),
        identifier: UIMenu.Identifier("com.reminders.plus.filter"),
        children: filterCommands
      ))
    }
    if has(.view) {
      builder.insertChild(
        UIMenu(title: "", identifier: UIMenu.Identifier("com.reminders.plus.view"), options: .displayInline, children: viewChildren),
        atStartOfMenu: .view
      )
    }

    if has(.view), let goTitle = MacSupportStore.shared.title("go") {
      let goMenu = UIMenu(
        title: goTitle,
        identifier: UIMenu.Identifier("com.reminders.plus.go"),
        children: [
          command("status", titleKey: "status", symbol: "arrow.up.right"),
          command("streaks", titleKey: "streaks", symbol: "flame"),
          command("archive", titleKey: "archive", symbol: "archivebox"),
          command("assist", titleKey: "assist", symbol: "message.badge.waveform"),
          command("cloudSync", titleKey: "cloudSync", symbol: "icloud"),
        ].compactMap { $0 }
      )
      builder.insertSibling(goMenu, afterMenu: .view)
    }

    if has(.help) {
      builder.insertChild(
        inline("help", [
          command("legal", titleKey: "legal", symbol: "doc.text"),
          command("support", titleKey: "support", symbol: "envelope"),
        ]),
        atStartOfMenu: .help
      )
    }
  }
}

// MARK: - Sidebar

/// On the Mac the tab bar becomes the sidebar (`NativeTabs sidebarAdaptable`).
/// React Native Screens owns the root tabs, so this only appends one group with
/// the projects as sidebar actions plus "New project", and puts the profile
/// menu into the sidebar's bottom bar. Selecting a project is an action, not a
/// tab, so React Native Screens never sees a tab it does not know.
@available(iOS 26.0, *)
final class MacSidebarController {
  static let shared = MacSidebarController()
  static let projectsGroupIdentifier = "com.reminders.plus.sidebar.projects"

  private weak var profileButton: UIButton?
  private weak var configuredTabBarController: UITabBarController?

  func apply(to tabBarController: UITabBarController) {
    guard MacEnvironment.isiOSAppOnMac else { return }
    let store = MacSupportStore.shared
    guard !store.projectsGroupTitle.isEmpty else { return }

    applyProjectsGroup(to: tabBarController, store: store)
    applyProfileBar(to: tabBarController, store: store)
  }

  private func projectActions(store: MacSupportStore) -> [UIAction] {
    var actions = store.projects.map { project in
      UIAction(
        title: project.title,
        image: project.image ?? UIImage(systemName: "folder")
      ) { _ in
        MacSupportStore.shared.send("openProject", value: project.id)
      }
    }
    // Projects can be added from the sidebar as well as from the overview.
    actions.append(UIAction(
      title: store.newProjectTitle,
      image: UIImage(systemName: "plus")
    ) { _ in
      MacSupportStore.shared.send("newProject")
    })
    return actions
  }

  private func applyProjectsGroup(to tabBarController: UITabBarController, store: MacSupportStore) {
    let actions = projectActions(store: store)
    if let existing = tabBarController.tabs.first(where: { $0.identifier == Self.projectsGroupIdentifier }) as? UITabGroup {
      existing.title = store.projectsGroupTitle
      existing.sidebarActions = actions
      return
    }

    let group = UITabGroup(
      title: store.projectsGroupTitle,
      image: UIImage(systemName: "folder"),
      identifier: Self.projectsGroupIdentifier,
      children: []
    ) { _ in
      // Never shown: the group is not a sidebar destination. UIKit still wants a
      // view controller for a root-level tab.
      UIViewController()
    }
    group.preferredPlacement = .sidebarOnly
    group.allowsHiding = false
    group.sidebarActions = actions
    let selectedTab = tabBarController.selectedTab
    tabBarController.setTabs(tabBarController.tabs + [group], animated: false)
    if let selectedTab, tabBarController.selectedTab !== selectedTab {
      tabBarController.selectedTab = selectedTab
    }
  }

  private func applyProfileBar(to tabBarController: UITabBarController, store: MacSupportStore) {
    let button: UIButton
    if let profileButton, configuredTabBarController === tabBarController {
      button = profileButton
    } else {
      var configuration = UIButton.Configuration.plain()
      configuration.image = UIImage(systemName: "person.crop.circle")
      configuration.imagePadding = 8
      configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16)
      button = UIButton(configuration: configuration)
      button.showsMenuAsPrimaryAction = true
      button.contentHorizontalAlignment = .leading
      button.tintColor = .label

      let container = UIView()
      button.translatesAutoresizingMaskIntoConstraints = false
      container.addSubview(button)
      NSLayoutConstraint.activate([
        button.leadingAnchor.constraint(equalTo: container.leadingAnchor),
        button.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        button.topAnchor.constraint(equalTo: container.topAnchor),
        button.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
      ])
      tabBarController.sidebar.bottomBarView = container
      profileButton = button
      configuredTabBarController = tabBarController
    }

    button.configuration?.title = store.profileTitle
    button.accessibilityLabel = store.profileTitle
    button.menu = UIMenu(children: store.profileSections.map { section in
      UIMenu(title: "", options: .displayInline, children: section.map { entry in
        UIAction(title: entry.title, image: entry.image) { _ in
          MacSupportStore.shared.send("profile", value: entry.id)
        }
      })
    })
  }

  func toggleSidebar() {
    guard let tabBarController = configuredTabBarController else { return }
    tabBarController.sidebar.isHidden.toggle()
  }
}

// MARK: - Window

enum MacWindowConfigurator {
  /// Keeps the sidebar and the page column readable when the Mac window shrinks.
  static let minimumSize = CGSize(width: 700, height: 500)

  static func configure(_ window: UIWindow) {
    guard MacEnvironment.isiOSAppOnMac else { return }
    window.windowScene?.sizeRestrictions?.minimumSize = minimumSize
  }
}

private extension UIColor {
  convenience init?(macHex: String) {
    var hex = macHex.trimmingCharacters(in: .whitespacesAndNewlines)
    if hex.hasPrefix("#") { hex.removeFirst() }
    guard hex.count == 6, let value = UInt32(hex, radix: 16) else { return nil }
    self.init(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }
}
