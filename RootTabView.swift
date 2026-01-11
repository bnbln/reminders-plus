import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

final class AddActionContext: ObservableObject {
    struct ReminderComposerRequest: Identifiable, Equatable {
        let id = UUID()
        let projectID: UUID?
    }

    @Published var currentProjectID: UUID? = nil
    @Published var reminderComposerRequest: ReminderComposerRequest? = nil

    func triggerReminder(for projectID: UUID?) {
        reminderComposerRequest = ReminderComposerRequest(projectID: projectID)
    }

    func clearReminderRequest() {
        reminderComposerRequest = nil
    }
}

private struct SyncBanner: Identifiable, Equatable {
    let id = UUID()
    let summary: CloudSyncSummary
    let title: String
    let detail: String?
    let iconName: String
}

private extension Set where Element == CloudSyncReason {
    var displayList: String? {
        guard !isEmpty else { return nil }
        return map { $0.description }.sorted().joined(separator: ", ")
    }
}

struct RootTabView: View {
    @StateObject private var store: ReminderStore
    @StateObject private var projectStore: ProjectStore
    @StateObject private var router = AppRouter()
    @StateObject private var syncCoordinator: CloudSyncCoordinator
    @StateObject private var addContext = AddActionContext()

    // Fallback selection state for < iOS 18 implementation
    @State private var legacySelected: Int = 0
    @State private var selectedTab: TabDestination = .tasks
    @State private var lastActiveTab: TabDestination = .tasks
    @State private var lastLegacyTab: Int = 0
    @State private var isPresentingProjectComposer = false
    @State private var activeReminderComposer: AddActionContext.ReminderComposerRequest? = nil
    @State private var isKeyboardVisible = false
    @State private var keyboardObservers: [NSObjectProtocol] = []
    @State private var activeSyncBanner: SyncBanner?
    @State private var bannerDismissTask: Task<Void, Never>?
    @State private var showOnboarding = false

    private enum TabDestination: Hashable {
        case tasks, projects, add
    }

    init() {
        // Don't seed dummy data - let CloudKit sync populate the data instead
        let reminderStore = ReminderStore(seedData: false)
        let projectsStore = ProjectStore(seedData: false)
        let coordinator = CloudSyncCoordinator(reminderStore: reminderStore, projectStore: projectsStore)
        if CloudSyncAvailability.isEnabled {
            reminderStore.syncDelegate = coordinator
            projectsStore.syncDelegate = coordinator
        }
        _syncCoordinator = StateObject(wrappedValue: coordinator)
        _store = StateObject(wrappedValue: reminderStore)
        _projectStore = StateObject(wrappedValue: projectsStore)
    }

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    
    // iPad navigation state
    @State private var selectedSidebarItem: SidebarItem? = .allTasks
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    
    enum SidebarItem: Hashable, Identifiable {
        case allTasks
        case profile
        case streaks
        case archive
        case project(UUID)
        case settings
        
        var id: String {
            switch self {
            case .allTasks: return "all-tasks"
            case .profile: return "profile"
            case .streaks: return "streaks"
            case .archive: return "archive"
            case .project(let id): return "project-\(id.uuidString)"
            case .settings: return "settings"
            }
        }
    }
    
    private var isIPad: Bool {
        horizontalSizeClass == .regular && verticalSizeClass == .regular
    }

    var body: some View {
        ZStack {
            tabScaffold
                .allowsHitTesting(activeReminderComposer == nil)
                .animation(.easeInOut(duration: 0.2), value: activeReminderComposer != nil)
                .environmentObject(store)
                .environmentObject(projectStore)
                .environmentObject(router)
                .environmentObject(addContext)
                .environmentObject(syncCoordinator)
                .onAppear {
                    if CloudSyncAvailability.isEnabled {
                        syncCoordinator.start()
                    }
                    setupKeyboardObservers()
                    updateOnboardingVisibility()
                }
                .onDisappear {
                    removeKeyboardObservers()
                    bannerDismissTask?.cancel()
                }
                .onOpenURL(perform: handleDeepLink)
                .onChange(of: syncCoordinator.lastSummary) { _, summary in
                    guard let summary else { return }
                    presentSyncBanner(for: summary)
                }
                .onChange(of: addContext.reminderComposerRequest) { oldValue, newRequest in
                    // If any view triggers a reminder request via the shared AddActionContext,
                    // move it into the local presentation state so the sheet(item:) can present.
                    DispatchQueue.main.async {
                        if let req = newRequest {
                            print("[RootTabView] observed addContext.reminderComposerRequest -> presenting request projectID=\(String(describing: req.projectID))")
                            activeReminderComposer = req
                            // Clear the shared request to avoid repeated presentation attempts.
                            addContext.clearReminderRequest()
                        }
                    }
                }
                .onChange(of: store.hasLoadedInitialData) { _, _ in
                    updateOnboardingVisibility()
                }
                .onChange(of: projectStore.hasLoadedInitialData) { _, _ in
                    updateOnboardingVisibility()
                }
                .onChange(of: store.reminders) { _, _ in
                    updateOnboardingVisibility()
                }
                .onChange(of: projectStore.projects) { _, _ in
                    updateOnboardingVisibility()
                }
                .sheet(isPresented: $isPresentingProjectComposer) {
                    ProjectComposerView(mode: .create) { project in
                        projectStore.add(project)
                    }
                    .presentationDetents([.fraction(0.6), .large])
                    .presentationDragIndicator(.visible)
                }
            
            // Custom overlay for ReminderComposer (no sheet!)
            if let request = activeReminderComposer {
                ZStack(alignment: .bottom) {
                    // Tappable clear area with subtle backdrop at top
                    Color.black.opacity(0.25)
                        .ignoresSafeArea()
                        .onTapGesture {
                            dismissComposer()
                        }
                    
                    // Composer UI on top
                    ReminderComposerView(mode: .create, initialProjectID: request.projectID) { reminder in
                        // Check if reminder already exists (might be called twice: once on save, once after AI icon update)
                        if store.reminders.contains(where: { $0.id == reminder.id }) {
                            // Already exists → update with new icon
                            store.update(reminder)
                        } else {
                            // New reminder → add it
                            store.add(reminder)
                            dismissComposer()
                        }
                    }
                    .environmentObject(projectStore)
                }
                .ignoresSafeArea(.container, edges: .bottom)
                .transition(.asymmetric(
                    insertion: .move(edge: .bottom).combined(with: .opacity),
                    removal: .move(edge: .bottom).combined(with: .opacity.animation(.easeInOut(duration: 0.25)))
                ))
                .zIndex(100)
            }

            if showOnboarding {
                onboardingOverlay
                    .transition(.opacity.combined(with: .scale))
            }
        }
#if DEBUG
        .overlay(alignment: .top) {
            syncStatusOverlay
        }
#endif
    }

    @ViewBuilder
    private var tabScaffold: some View {
        if isIPad {
            iPadLayout
        } else {
            tabContent
        }
    }

    @ViewBuilder
    private var syncStatusOverlay: some View {
        VStack(spacing: 8) {
            if syncCoordinator.isSyncing {
                syncProgressChip
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            if let banner = activeSyncBanner {
                syncBannerView(banner)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    .padding(.top, syncOverlayTopPadding)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: syncCoordinator.isSyncing)
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: activeSyncBanner)
        .allowsHitTesting(false)
    }

    private var syncProgressChip: some View {
        HStack(spacing: 10) {
            ProgressView()
                .scaleEffect(0.8)
            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "root_sync_progress_title"))
                    .font(.footnote.weight(.semibold))
                if let reasons = syncCoordinator.lastSyncReasons.displayList {
                    let format = String(localized: "root_sync_reasons_format")
                    Text(String(format: format, locale: .current, reasons))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 14)
        .background(.ultraThinMaterial, in: Capsule(style: .continuous))
        .shadow(color: Color.black.opacity(0.15), radius: 12, x: 0, y: 6)
    }

    private func syncBannerView(_ banner: SyncBanner) -> some View {
        HStack(spacing: 12) {
            Image(systemName: banner.iconName)
                .font(.body.weight(.semibold))
                .symbolRenderingMode(.hierarchical)
            VStack(alignment: .leading, spacing: 2) {
                Text(banner.title)
                    .font(.footnote.weight(.semibold))
                if let detail = banner.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: Color.black.opacity(0.18), radius: 24, x: 0, y: 14)
    }

    private var syncOverlayTopPadding: CGFloat {
        #if canImport(UIKit)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first(where: { $0.isKeyWindow }) {
            let inset = window.safeAreaInsets.top
            return (inset > 0 ? inset : 12) + 8
        }
        #endif
        return 20
    }

    private func presentSyncBanner(for summary: CloudSyncSummary) {
        guard let banner = buildSyncBanner(for: summary) else { return }
        bannerDismissTask?.cancel()
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            activeSyncBanner = banner
        }
        bannerDismissTask = Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            await MainActor.run {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                    activeSyncBanner = nil
                }
            }
        }
    }

    private func buildSyncBanner(for summary: CloudSyncSummary) -> SyncBanner? {
        var icon = "icloud"
        var title: String
        var detail: String?

        if summary.hasConflicts {
            title = String(localized: "root_sync_banner_conflicts_title")
            icon = "exclamationmark.arrow.circlepath"
            let conflictCount = summary.reminderConflicts + summary.projectConflicts + summary.eventConflicts
            let format = NSLocalizedString("root_sync_banner_conflicts_resolved", comment: "")
            detail = String.localizedStringWithFormat(format, conflictCount)
        } else if summary.reasons.contains(.remotePush) && !summary.reasons.contains(.dataChanged) {
            title = String(localized: "root_sync_banner_latest_changes_title")
            icon = "icloud.and.arrow.down"
        } else if summary.reasons.contains(.remotePush) && summary.reasons.contains(.dataChanged) {
            title = String(localized: "root_sync_banner_synced_devices_title")
            icon = "arrow.triangle.2.circlepath"
        } else if summary.reasons.contains(.dataChanged) {
            title = String(localized: "root_sync_banner_changes_uploaded_title")
            icon = "icloud.and.arrow.up"
        } else if summary.reasons.contains(.launch) {
            title = String(localized: "root_sync_banner_ready_title")
            icon = "checkmark.icloud"
        } else {
            title = String(localized: "root_sync_banner_complete_title")
        }

        if detail == nil {
            let net = summary.netChangesDescription
            if !net.isEmpty {
                detail = net
            }
        }

        if detail == nil, summary.reasons == [.launch] {
            let timestamp = summary.timestamp.formatted(date: .omitted, time: .standard)
            let format = String(localized: "root_sync_banner_last_updated_format")
            detail = String(format: format, locale: .current, timestamp)
        }

        if detail == nil {
            detail = String(localized: "root_sync_banner_no_changes")
        }

        return SyncBanner(summary: summary, title: title, detail: detail, iconName: icon)
    }

    private func updateOnboardingVisibility() {
        guard store.hasLoadedInitialData && projectStore.hasLoadedInitialData else { return }
        let shouldShow = !AppSettings.hasCompletedOnboarding && store.reminders.isEmpty && projectStore.projects.isEmpty
        if shouldShow != showOnboarding {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) {
                showOnboarding = shouldShow
            }
        }
    }

    private func completeOnboarding() {
        AppSettings.hasCompletedOnboarding = true
        withAnimation(.spring(response: 0.42, dampingFraction: 0.85)) {
            showOnboarding = false
        }
    }

    @ViewBuilder
    private var onboardingOverlay: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .transition(.opacity)

            OnboardingFlowView(onComplete: completeOnboarding)
                .environmentObject(syncCoordinator)
                .transition(.scale(scale: 0.95).combined(with: .opacity))
        }
        .zIndex(200)
        .accessibilityAddTraits(.isModal)
    }
    
    @ViewBuilder
    private var iPadLayout: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebarContent
        } detail: {
            detailContent
        }
        .navigationSplitViewStyle(.balanced)
        .navigationSplitViewColumnWidth(min: 240, ideal: 300, max: 360)
    }
    
    @ViewBuilder
    private var sidebarContent: some View {
        List(selection: $selectedSidebarItem) {
            Section {
                NavigationLink(value: SidebarItem.allTasks) {
                    Label(String(localized: "root_sidebar_all_tasks"), systemImage: "checkmark.circle.fill")
                }
                NavigationLink(value: SidebarItem.streaks) {
                    Label(String(localized: "root_sidebar_streaks"), systemImage: "flame.fill")
                }
                NavigationLink(value: SidebarItem.archive) {
                    Label(String(localized: "root_sidebar_archive"), systemImage: "archivebox.fill")
                }
            }
            
            Section(String(localized: "root_sidebar_projects_section")) {
                ForEach(projectStore.projects) { project in
                    NavigationLink(value: SidebarItem.project(project.id)) {
                        projectRow(for: project)
                    }
                }
            }
            
            Section {
                NavigationLink(value: SidebarItem.settings) {
                    Label(String(localized: "root_sidebar_settings"), systemImage: "gearshape")
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle(String(localized: "root_sidebar_navigation_title"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                addButton
            }
        }
    }
    
    @ViewBuilder
    private func projectRow(for project: Project) -> some View {
        HStack {
            Circle()
                .fill(project.customColor)
                .frame(width: 12, height: 12)
            Text(project.name)
        }
    }
    
    @ViewBuilder
    private var addButton: some View {
        Menu {
            Button {
                addReminderAction()
            } label: {
                Label(String(localized: "root_add_new_reminder"), systemImage: "plus.circle")
            }
            .keyboardShortcut("n", modifiers: .command)
            
            Button {
                isPresentingProjectComposer = true
            } label: {
                Label(String(localized: "root_add_new_project"), systemImage: "folder.badge.plus")
            }
            .keyboardShortcut("n", modifiers: [.command, .shift])
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.title2)
        }
    }
    
    @ViewBuilder
    private var detailContent: some View {
        if let selectedItem = selectedSidebarItem {
            detailView(for: selectedItem)
        } else {
            placeholderView
        }
    }
    
    @ViewBuilder
    private func detailView(for item: SidebarItem) -> some View {
        switch item {
        case .allTasks:
            RemindersHomeView()
        case .profile:
            // Placeholder for Profile view
            Text("Profile")
                .font(.largeTitle)
                .foregroundColor(.secondary)
        case .streaks:
            StreaksHistoryView()
        case .archive:
            ArchiveView()
        case .project(let projectID):
            projectDetailView(for: projectID)
        case .settings:
            SettingsView()
        }
    }
    
    @ViewBuilder
    private func projectDetailView(for projectID: UUID) -> some View {
        if let project = projectStore.projects.first(where: { $0.id == projectID }) {
            ProjectDetailView(project: project)
        } else {
            placeholderView
        }
    }
    
    @ViewBuilder
    private var placeholderView: some View {
        Text(String(localized: "root_sidebar_placeholder"))
            .foregroundColor(.secondary)
    }
    
    private func addReminderAction() {
        if case .project(let projectID) = selectedSidebarItem {
            openReminderComposer(with: projectID)
        } else {
            openReminderComposer(with: nil)
        }
    }

    @ViewBuilder
    private var tabContent: some View {
        if #available(iOS 18.0, *) {
            TabView(selection: $selectedTab) {
                Tab(value: .tasks) {
                    RemindersHomeView()
                } label: {
                    Label(String(localized: "root_tab_tasks"), systemImage: "checkmark.circle.fill")
                }

                Tab(value: .projects) {
                    ProjectsView()
                } label: {
                    Label(String(localized: "root_tab_projects"), systemImage: "folder")
                }

                Tab(value: .add, role: .search) {
                    Color.clear
                } label: {
                    Label(String(localized: "root_tab_add"), systemImage: "plus")
                }
            }
            .onChange(of: selectedTab) { oldValue, newValue in
                if newValue == .add {
                    let previous = lastActiveTab
                    presentAddAction(for: previous)
                    var transaction = Transaction()
                    transaction.disablesAnimations = true
                    withTransaction(transaction) {
                        selectedTab = previous
                    }
                } else {
                    lastActiveTab = newValue
                }
            }
        } else {
            TabView(selection: $legacySelected) {
                RemindersHomeView()
                    .tag(0)
                    .tabItem { Label(String(localized: "root_tab_tasks"), systemImage: "checkmark.circle.fill") }

                ProjectsView()
                    .tag(1)
                    .tabItem { Label(String(localized: "root_tab_projects"), systemImage: "folder") }

                Color.clear
                    .tag(2)
                    .tabItem { Label(String(localized: "root_tab_add"), systemImage: "plus.circle.fill") }
            }
            .onChange(of: legacySelected) { oldValue, newValue in
                if newValue == 2 {
                    let previous = lastLegacyTab
                    presentAddAction(for: tabDestination(forLegacyIndex: previous))
                    var transaction = Transaction()
                    transaction.disablesAnimations = true
                    withTransaction(transaction) {
                        legacySelected = previous
                    }
                } else {
                    lastLegacyTab = newValue
                }
            }
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard url.scheme?.lowercased() == "liquidglass" else { return }
        if url.host?.lowercased() == "create" || url.pathComponents.contains("create-reminder") {
            presentAddAction(for: .tasks)
        }
    }

    private func presentAddAction(for tab: TabDestination) {
        DispatchQueue.main.async {
            // Prefer the currently active project if any (e.g. when inside ProjectDetailView).
            let activeProject = addContext.currentProjectID

            print("[RootTabView] presentAddAction tab=\(tab) activeProject=\(String(describing: activeProject))")

            // reset
            isPresentingProjectComposer = false

            if let projectID = activeProject {
                // Validate project exists in store before presenting to avoid passing stale IDs
                let exists = projectStore.projects.contains { $0.id == projectID }
                if exists {
                    print("[RootTabView] presenting composer for existing project \(projectID)")
                    activeReminderComposer = AddActionContext.ReminderComposerRequest(projectID: projectID)
                } else {
                    // fallback to no project
                    print("[RootTabView] activeProject not found, falling back to nil")
                    activeReminderComposer = AddActionContext.ReminderComposerRequest(projectID: nil)
                }
                return
            }

            // No active project; fall back to tab-based behavior.
            switch tab {
            case .tasks, .add:
                openReminderComposer(with: nil)
            case .projects:
                // When Projects tab is active but no project is focused, open the Project composer.
                isPresentingProjectComposer = true
            }
        }
    }

    private func tabDestination(forLegacyIndex index: Int) -> TabDestination {
        switch index {
        case 1: return .projects
        default: return .tasks
        }
    }
    
    private func legacyIndex(for destination: TabDestination) -> Int {
        switch destination {
        case .tasks: return 0
        case .projects: return 1
        case .add: return 2
        }
    }

    private func openReminderComposer(with projectID: UUID?) {
        // Ensure we set the local presentation state on the main runloop
        DispatchQueue.main.async {
            print("[RootTabView] openReminderComposer requested projectID=\(String(describing: projectID))")
            if let pid = projectID, projectStore.projects.contains(where: { $0.id == pid }) {
                print("[RootTabView] openReminderComposer: project exists, presenting with pid=\(pid)")
                activeReminderComposer = AddActionContext.ReminderComposerRequest(projectID: pid)
            } else {
                print("[RootTabView] openReminderComposer: presenting with no project")
                activeReminderComposer = AddActionContext.ReminderComposerRequest(projectID: nil)
            }
        }
    }
    
    private func dismissComposer() {
        // CRITICAL: Dismiss keyboard first to prevent layout issues
        #if canImport(UIKit)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        #endif
        
        // Small delay to let keyboard animation start before dismissing composer
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                activeReminderComposer = nil
            }
        }
    }
    
    private func setupKeyboardObservers() {
#if canImport(UIKit)
        guard keyboardObservers.isEmpty else { return }

        let willShow = NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillShowNotification,
            object: nil,
            queue: .main
        ) { _ in
            isKeyboardVisible = true
        }

        let willHide = NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { _ in
            isKeyboardVisible = false
        }

        keyboardObservers.append(contentsOf: [willShow, willHide])
#endif
    }

    private func removeKeyboardObservers() {
        #if canImport(UIKit)
        keyboardObservers.forEach { NotificationCenter.default.removeObserver($0) }
        keyboardObservers.removeAll()
        isKeyboardVisible = false
        #endif
    }
}

#Preview {
    RootTabView()
}
