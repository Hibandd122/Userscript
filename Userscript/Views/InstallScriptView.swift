import SwiftUI

public struct InstallScriptView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var urlString = ""
    @State private var isDownloading = false
    @State private var errorMessage: String? = nil
    @State private var previewScript: UserScript? = nil
    @State private var previewCode: String? = nil
    @Environment(\.dismiss) private var dismiss

    public init() {}

    public var body: some View {
        NavigationStack {
            Form {
                Section("Install from GreasyFork or URL") {
                    HStack {
                        TextField("https://greasyfork.org/scripts/...", text: $urlString)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)

                        if !urlString.isEmpty {
                            Button {
                                urlString = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }

                    HStack(spacing: 12) {
                        Button {
                            if let pasteboardString = UIPasteboard.general.string {
                                urlString = pasteboardString.trimmingCharacters(in: .whitespacesAndNewlines)
                            }
                        } label: {
                            Label("Paste", systemImage: "doc.on.clipboard")
                        }
                        .buttonStyle(.bordered)

                        Spacer()

                        Button {
                            fetchScript()
                        } label: {
                            if isDownloading {
                                ProgressView()
                                    .padding(.horizontal, 16)
                            } else {
                                Text("Inspect Script")
                                    .fontWeight(.semibold)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(urlString.trimmingCharacters(in: .whitespaces).isEmpty || isDownloading)
                    }
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.subheadline)
                    }
                }

                if let script = previewScript {
                    Section("Script Preview") {
                        HStack {
                            Text("Name")
                            Spacer()
                            Text(script.name)
                                .fontWeight(.medium)
                        }

                        HStack {
                            Text("Version")
                            Spacer()
                            Text(script.version)
                                .foregroundColor(.secondary)
                        }

                        if !script.author.isEmpty {
                            HStack {
                                Text("Author")
                                Spacer()
                                Text(script.author)
                                    .foregroundColor(.secondary)
                        }

                        if !script.description.isEmpty {
                            Text(script.description)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }

                    Section("Matched Domains") {
                        ForEach(script.matches, id: \.self) { match in
                            Text(match)
                                .font(.system(.body, design: .monospaced))
                        }
                    }

                    Section {
                        Button {
                            manager.add(script: script)
                            dismiss()
                        } label: {
                            HStack {
                                Spacer()
                                Label("Install Script", systemImage: "arrow.down.circle.fill")
                                    .font(.headline)
                                Spacer()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Install Script")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func fetchScript() {
        isDownloading = true
        errorMessage = nil
        previewScript = nil
        previewCode = nil

        Task {
            do {
                let result = try await ScriptDownloader.fetch(from: urlString)
                await MainActor.run {
                    self.previewScript = result.script
                    self.previewCode = result.rawCode
                    self.isDownloading = false
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = error.localizedDescription
                    self.isDownloading = false
                }
            }
        }
    }
}
