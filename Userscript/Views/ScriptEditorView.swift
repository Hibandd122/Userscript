import SwiftUI

// MARK: - 🧑💻 ScriptEditorView 2.0: Professional Mini Xcode Code Editor (Section 11)
public struct ScriptEditorView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State var script: UserScript
    @State private var codeText: String
    @State private var searchText = ""
    @State private var showingSearch = false
    @State private var showingLineNumbers = true
    @State private var hasChanges = false
    @State private var toastMessage: String? = nil
    @Environment(\.dismiss) private var dismiss

    public init(script: UserScript) {
        _script = State(initialValue: script)
        _codeText = State(initialValue: script.content)
    }

    private var lineCount: Int {
        max(1, codeText.components(separatedBy: "\n").count)
    }

    private var matchCount: Int {
        guard !searchText.isEmpty else { return 0 }
        return codeText.components(separatedBy: searchText).count - 1
    }

    public var body: some View {
        NavigationView {
            ZStack {
                USColor.surfaceBackground.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar if active
                    if showingSearch {
                        searchHeader
                    }

                    // Professional Code Editor Surface
                    editorSurface

                    // Developer Footer (Section 11)
                    developerFooter
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
            .navigationTitle(script.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(.subheadline)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: USSpacing.m) {
                        Button(action: {
                            withAnimation(USMotion.quickSpring) {
                                showingSearch.toggle()
                            }
                        }) {
                            Image(systemName: "magnifyingglass")
                                .font(.subheadline)
                        }

                        Button(action: saveChanges) {
                            Text("Save")
                                .font(.subheadline.bold())
                                .foregroundColor(hasChanges ? USColor.safariBlue : .secondary)
                        }
                        .disabled(!hasChanges)
                    }
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    // MARK: - Search Header
    private var searchHeader: some View {
        HStack(spacing: USSpacing.s) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
                .font(.caption)
            TextField("Find in script...", text: $searchText)
                .font(.system(size: 13, design: .monospaced))
                .textFieldStyle(.plain)

            if !searchText.isEmpty {
                Text("\(matchCount) matches")
                    .font(.caption2.bold())
                    .foregroundColor(USColor.safariBlue)
                Button(action: { searchText = "" }) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                        .font(.caption)
                }
            }
        }
        .padding(.horizontal, USSpacing.m)
        .padding(.vertical, 8)
        .background(USColor.secondarySurface)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(USColor.separator.opacity(0.5)),
            alignment: .bottom
        )
    }

    // MARK: - Editor Surface with Line Numbers
    private var editorSurface: some View {
        HStack(alignment: .top, spacing: 0) {
            if showingLineNumbers {
                // Line Number Gutter
                VStack(alignment: .trailing, spacing: 3.5) {
                    ForEach(1...min(lineCount, 600), id: \.self) { num in
                        Text("\(num)")
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .foregroundColor(.secondary.opacity(0.6))
                    }
                    Spacer()
                }
                .padding(.horizontal, 6)
                .padding(.top, 10)
                .frame(width: 36)
                .background(USColor.secondarySurface.opacity(0.5))
                .overlay(
                    Rectangle()
                        .frame(width: 1)
                        .foregroundColor(USColor.separator.opacity(0.3)),
                    alignment: .trailing
                )
            }

            // Monospaced Code Text Editor
            TextEditor(text: $codeText)
                .font(.system(size: 13, design: .monospaced))
                .padding(8)
                .onChange(of: codeText) { newValue in
                    hasChanges = (newValue != script.content)
                }
        }
    }

    // MARK: - Developer Footer (Section 11)
    private var developerFooter: some View {
        HStack(spacing: USSpacing.m) {
            Text("Ln \(lineCount)")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(.secondary)
            Text("•")
                .foregroundColor(.secondary.opacity(0.5))
            Text("JavaScript")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(.secondary)
            Text("•")
                .foregroundColor(.secondary.opacity(0.5))
            Text("UTF-8")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(.secondary)

            Spacer()

            if hasChanges {
                USBadge("Unsaved Changes", variant: .warning)
            } else {
                Text("\(codeText.utf8.count) bytes")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, USSpacing.m)
        .padding(.vertical, 8)
        .background(USColor.secondarySurface)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(USColor.separator.opacity(0.5)),
            alignment: .top
        )
    }

    private func saveChanges() {
        USHaptics.success()
        var updated = script
        updated.content = codeText
        manager.add(script: updated)
        hasChanges = false
        showToast("Script saved successfully")
    }

    private func showToast(_ msg: String) {
        withAnimation(USMotion.quickSpring) {
            self.toastMessage = msg
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            withAnimation(USMotion.quickSpring) {
                self.toastMessage = nil
            }
        }
    }
}
