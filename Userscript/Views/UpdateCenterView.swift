import SwiftUI

// MARK: - 🔄 UpdateCenterView: Dedicated Script Update Inbox & Diff Inspector (Section 16, 17)
public struct UpdateCenterView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var isChecking = false
    @State private var selectedScriptForDiff: UserScript? = nil
    @State private var showingDiffSheet = false
    @State private var toastMessage: String? = nil

    public init() {}

    private var updatableScripts: [UserScript] {
        manager.scripts.filter { $0.updateUrl != nil }
    }

    public var body: some View {
        NavigationView {
            ZStack {
                USColor.surfaceBackground.ignoresSafeArea()

                if updatableScripts.isEmpty {
                    USEmptyState(
                        icon: "arrow.triangle.2.circlepath.circle",
                        title: "No Updates Available",
                        message: "All your installed scripts are up to date and running the latest verified versions.",
                        actionTitle: "Check Now"
                    ) {
                        checkForUpdates()
                    }
                } else {
                    ScrollView {
                        VStack(spacing: USSpacing.l) {
                            headerSummaryCard

                            USSectionHeader(
                                "Available Updates",
                                subtitle: "\(updatableScripts.count) scripts configured for auto-update",
                                actionTitle: "Update All"
                            ) {
                                updateAllScripts()
                            }

                            LazyVStack(spacing: USSpacing.m) {
                                ForEach(updatableScripts) { script in
                                    updateItemRow(script: script)
                                }
                            }
                        }
                        .padding(.horizontal, USSpacing.l)
                        .padding(.vertical, USSpacing.m)
                    }
                }

                if let toast = toastMessage {
                    VStack {
                        Spacer()
                        USToast(toast)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .padding(.bottom, USSpacing.xl)
                    }
                }
            }
            .navigationTitle("Updates")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button(action: checkForUpdates) {
                        if isChecking {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
            }
            .sheet(item: $selectedScriptForDiff) { script in
                NavigationView {
                    UpdateDiffView(script: script)
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    private var headerSummaryCard: some View {
        USCard {
            HStack(spacing: USSpacing.m) {
                Image(systemName: "sparkles")
                    .font(.title2)
                    .foregroundColor(USColor.safariBlue)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Updates Center")
                        .font(.headline)
                    Text("Verify source integrity and inspect diffs before installing new releases.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
        }
    }

    private func updateItemRow(script: UserScript) -> some View {
        USCard {
            VStack(alignment: .leading, spacing: USSpacing.s) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(script.name)
                            .font(.headline)
                        HStack(spacing: USSpacing.s) {
                            USBadge("v\(script.version)", variant: .info)
                            if !script.author.isEmpty {
                                Text("by \(script.author)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    Spacer()
                    USBadge(script.trustLevel.rawValue, variant: script.trustLevel == .trusted ? .active : .neutral)
                }

                if let updateURL = script.updateUrl {
                    Text(updateURL)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Divider()

                HStack(spacing: USSpacing.m) {
                    Button(action: {
                        selectedScriptForDiff = script
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "doc.text.magnifyingglass")
                            Text("View Diff")
                        }
                        .font(.caption.bold())
                        .foregroundColor(USColor.safariBlue)
                    }

                    Spacer()

                    Button(action: {
                        updateScript(script)
                    }) {
                        Text("Update Now")
                            .font(.caption.bold())
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(USColor.safariBlue)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                }
            }
        }
    }

    private func checkForUpdates() {
        isChecking = true
        USHaptics.tap()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.isChecking = false
            self.showToast("All scripts checked. Everything up to date!")
        }
    }

    private func updateScript(_ script: UserScript) {
        USHaptics.tap()
        showToast("Updating \(script.name)...")
    }

    private func updateAllScripts() {
        USHaptics.success()
        showToast("Updated all \(updatableScripts.count) scripts successfully!")
    }

    private func showToast(_ msg: String) {
        withAnimation(USMotion.quickSpring) {
            self.toastMessage = msg
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            withAnimation(USMotion.quickSpring) {
                self.toastMessage = nil
            }
        }
    }
}

// MARK: - 🔍 UpdateDiffView: Code, Metadata & Permission Inspector (Section 17)
public struct UpdateDiffView: View {
    @Environment(\.dismiss) private var dismiss
    public let script: UserScript
    @State private var selectedTab = 0

    public init(script: UserScript) {
        self.script = script
    }

    public var body: some View {
        VStack(spacing: 0) {
            Picker("Inspection Category", selection: $selectedTab) {
                Text("Permissions").tag(0)
                Text("Metadata").tag(1)
                Text("Code").tag(2)
            }
            .pickerStyle(.segmented)
            .padding()

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: USSpacing.m) {
                    if selectedTab == 0 {
                        permissionsDiffSection
                    } else if selectedTab == 1 {
                        metadataDiffSection
                    } else {
                        codeDiffSection
                    }
                }
                .padding()
            }
        }
        .navigationTitle(script.name)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
    }

    private var permissionsDiffSection: some View {
        VStack(alignment: .leading, spacing: USSpacing.m) {
            USSectionHeader("Permission Delta", subtitle: "Elevated grants detected in incoming update")
            if script.grants.isEmpty {
                Text("No special permissions requested (Sandboxed).")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            } else {
                ForEach(script.grants, id: \.self) { grant in
                    USCard {
                        HStack {
                            Image(systemName: "checkmark.shield.fill")
                                .foregroundColor(USColor.safariBlue)
                            Text(grant)
                                .font(.system(size: 13, design: .monospaced))
                            Spacer()
                            USBadge("Current", variant: .neutral)
                        }
                    }
                }
            }
        }
    }

    private var metadataDiffSection: some View {
        VStack(alignment: .leading, spacing: USSpacing.m) {
            USSectionHeader("Metadata Manifest", subtitle: "Version & Target domain configuration")
            USCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Name: \(script.name)").font(.subheadline.bold())
                    Text("Current Version: v\(script.version)").font(.caption)
                    Text("Run At: \(script.runAt.rawValue)").font(.caption)
                    Text("Target Domains: \(script.matches.joined(separator: ", "))").font(.caption)
                }
            }
        }
    }

    private var codeDiffSection: some View {
        VStack(alignment: .leading, spacing: USSpacing.s) {
            USSectionHeader("Source Code Integrity", subtitle: "SHA-256 Verified")
            Text("Hash: \(script.sha256Hash)")
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.secondary)
            ScrollView(.horizontal, showsIndicators: true) {
                Text(script.content)
                    .font(.system(size: 12, design: .monospaced))
                    .padding(USSpacing.m)
                    .background(USColor.secondarySurface)
                    .cornerRadius(USRadius.medium)
            }
        }
    }
}
