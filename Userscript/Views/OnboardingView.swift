import SwiftUI

// MARK: - 🧭 OnboardingView: 3-Step Native Welcome Experience (Section 58, 59)
public struct OnboardingView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var manager = ScriptManager.shared
    @State private var currentStep = 0
    @State private var isInstallingSample = false
    @State private var sampleInstalled = false

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(.secondary)
                }
                .padding()
            }

            TabView(selection: $currentStep) {
                stepOneExtensionVerification.tag(0)
                stepTwoSampleScript.tag(1)
                stepThreeStartBrowsing.tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .always))

            footerControls
                .padding(.horizontal, USSpacing.xl)
                .padding(.bottom, USSpacing.xl)
        }
    }

    // Step 1: Enable Safari Web Extension
    private var stepOneExtensionVerification: some View {
        VStack(spacing: USSpacing.l) {
            Image(systemName: "safari.fill")
                .font(.system(size: 64))
                .foregroundColor(USColor.safariBlue)
                .padding(.top, USSpacing.xl)

            VStack(spacing: USSpacing.xs) {
                Text("Enable Safari Extension")
                    .font(.title2.bold())
                Text("Allow Userscript to customize your web experience seamlessly in Safari.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, USSpacing.l)
            }

            USCard {
                HStack(spacing: USSpacing.m) {
                    Image(systemName: "1.circle.fill")
                        .foregroundColor(USColor.safariBlue)
                        .font(.headline)
                    Text("Open Safari > Settings > Extensions")
                        .font(.subheadline)
                }
                Divider()
                HStack(spacing: USSpacing.m) {
                    Image(systemName: "2.circle.fill")
                        .foregroundColor(USColor.safariBlue)
                        .font(.headline)
                    Text("Turn on 'Userscript Extension'")
                        .font(.subheadline)
                }
                Divider()
                HStack(spacing: USSpacing.m) {
                    Image(systemName: "3.circle.fill")
                        .foregroundColor(USColor.safariBlue)
                        .font(.headline)
                    Text("Grant 'Always Allow on Every Website'")
                        .font(.subheadline)
                }
            }
            .padding(.horizontal, USSpacing.xl)

            #if os(iOS)
            Button(action: {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }) {
                HStack {
                    Image(systemName: "gear")
                    Text("Open Safari Settings")
                }
                .font(.subheadline.bold())
                .foregroundColor(USColor.safariBlue)
            }
            #endif

            Spacer()
        }
    }

    // Step 2: Install First Userscript
    private var stepTwoSampleScript: some View {
        VStack(spacing: USSpacing.l) {
            Image(systemName: "scroll.fill")
                .font(.system(size: 64))
                .foregroundColor(USColor.purple)
                .padding(.top, USSpacing.xl)

            VStack(spacing: USSpacing.xs) {
                Text("Add Your First Script")
                    .font(.title2.bold())
                Text("Install a pre-tested popular script or bring your own .user.js files.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, USSpacing.l)
            }

            USCard {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("MangaUniversal Pro")
                            .font(.headline)
                        Text("Seamless infinite reader for MangaDex & webtoons")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    if sampleInstalled {
                        USBadge("Installed", variant: .active, icon: "checkmark")
                    } else {
                        Button(action: installSample) {
                            if isInstallingSample {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Text("Install")
                                    .font(.caption.bold())
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(USColor.safariBlue)
                                    .foregroundColor(.white)
                                    .cornerRadius(8)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, USSpacing.xl)

            Spacer()
        }
    }

    // Step 3: All Set & Start Browsing
    private var stepThreeStartBrowsing: some View {
        VStack(spacing: USSpacing.l) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 64))
                .foregroundColor(USColor.success)
                .padding(.top, USSpacing.xl)

            VStack(spacing: USSpacing.xs) {
                Text("You're All Set!")
                    .font(.title2.bold())
                Text("Safari is now equipped with zero-telemetry, ultra-fast script management.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, USSpacing.l)
            }

            USCard {
                HStack(spacing: USSpacing.m) {
                    Image(systemName: "lock.shield.fill")
                        .foregroundColor(USColor.success)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("100% Privacy Focused")
                            .font(.subheadline.bold())
                        Text("No trackers, no external cloud telemetry.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(.horizontal, USSpacing.xl)

            Spacer()
        }
    }

    private var footerControls: some View {
        HStack {
            if currentStep > 0 {
                Button("Back") {
                    withAnimation { currentStep -= 1 }
                }
                .font(.subheadline)
                .foregroundColor(.secondary)
            }

            Spacer()

            if currentStep < 2 {
                Button("Next") {
                    withAnimation { currentStep += 1 }
                }
                .font(.headline)
                .padding(.horizontal, USSpacing.xl)
                .padding(.vertical, 10)
                .background(USColor.safariBlue)
                .foregroundColor(.white)
                .cornerRadius(USRadius.medium)
            } else {
                Button("Get Started") {
                    dismiss()
                }
                .font(.headline)
                .padding(.horizontal, USSpacing.xl)
                .padding(.vertical, 10)
                .background(USColor.success)
                .foregroundColor(.white)
                .cornerRadius(USRadius.medium)
            }
        }
    }

    private func installSample() {
        isInstallingSample = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            self.manager.installDefaultScripts()
            self.isInstallingSample = false
            self.sampleInstalled = true
            USHaptics.success()
        }
    }
}
