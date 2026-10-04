import SwiftUI

public struct MatchTesterView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var testUrl = "https://mangadex.org"
    @State private var testResults: [ScriptManager.MatchTestResult] = []

    public init() {}

    public var body: some View {
        List {
            Section(header: Text("Test URL Input")) {
                HStack {
                    TextField("Enter target website URL", text: $testUrl)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                    Button("Test") {
                        runTest()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }

            Section(header: Text("Quick Presets")) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        PresetChip(title: "MangaDex", url: "https://mangadex.org") { testUrl = $0; runTest() }
                        PresetChip(title: "CuuTruyen", url: "https://cuutruyen.net/manga/1") { testUrl = $0; runTest() }
                        PresetChip(title: "YouTube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ") { testUrl = $0; runTest() }
                        PresetChip(title: "Google", url: "https://www.google.com/search?q=test") { testUrl = $0; runTest() }
                    }
                }
            }

            Section(header: Text("Matching Evaluation Results (\(testResults.filter { $0.isMatched }.count) matched)")) {
                if testResults.isEmpty {
                    Text("Enter a URL above and tap Test to evaluate match engine logic.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } else {
                    ForEach(testResults) { item in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: item.isMatched ? "checkmark.circle.fill" : "xmark.circle")
                                .foregroundColor(item.isMatched ? .green : .secondary)
                                .font(.title3)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.script.name)
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                Text(item.reason)
                                    .font(.caption2)
                                    .foregroundColor(item.isMatched ? .primary : .secondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .navigationTitle("Match Engine Tester")
        .onAppear {
            runTest()
        }
    }

    private func runTest() {
        testResults = manager.testMatches(for: testUrl.trimmingCharacters(in: .whitespaces))
    }
}

struct PresetChip: View {
    let title: String
    let url: String
    let action: (String) -> Void

    var body: some View {
        Button(action: { action(url) }) {
            Text(title)
                .font(.caption)
                .fontWeight(.semibold)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(8)
        }
    }
}
