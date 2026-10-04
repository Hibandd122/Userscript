import SwiftUI

public struct CleanupCenterView: View {
    @State private var scanReport: StorageManager.CleanupCandidateReport? = nil
    @State private var isCleaning = false
    @State private var cleanedBytes: Int64? = nil

    public init() {}

    public var body: some View {
        List {
            Section(header: Text("Cleanup Overview")) {
                Text("Scan your storage for old database backups, expired temporary files, and orphaned caches.")
                    .font(.caption)
                    .foregroundColor(.secondary)

                if let report = scanReport {
                    HStack {
                        Text("Reclaimable Space")
                        Spacer()
                        Text(formatBytes(report.totalReclaimableBytes))
                            .fontWeight(.bold)
                            .foregroundColor(.blue)
                    }
                    HStack {
                        Text("Old Database Backups")
                        Spacer()
                        Text("\(report.backupFilesCount) files (\(formatBytes(report.backupFilesSizeBytes)))")
                            .foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Temporary Cache Files")
                        Spacer()
                        Text("\(report.tempFilesCount) files (\(formatBytes(report.tempFilesSizeBytes)))")
                            .foregroundColor(.secondary)
                    }
                }
            }

            Section {
                Button(action: performClean) {
                    HStack {
                        Spacer()
                        if isCleaning {
                            ProgressView()
                        } else {
                            Text("Clean Safe Items Now")
                                .fontWeight(.bold)
                                .foregroundColor(.red)
                        }
                        Spacer()
                    }
                }
                .disabled(isCleaning || (scanReport?.totalReclaimableBytes ?? 0) == 0)
            }

            if let cleaned = cleanedBytes {
                Section {
                    Text("Successfully freed \(formatBytes(cleaned))!")
                        .foregroundColor(.green)
                        .fontWeight(.semibold)
                }
            }
        }
        .navigationTitle("Cleanup Center")
        .onAppear {
            refreshScan()
        }
    }

    private func refreshScan() {
        scanReport = StorageManager.shared.scanCleanupCandidates()
    }

    private func performClean() {
        isCleaning = true
        DispatchQueue.global(qos: .userInitiated).async {
            let freed = StorageManager.shared.cleanAllSafeItems()
            DispatchQueue.main.async {
                self.cleanedBytes = freed
                self.isCleaning = false
                self.refreshScan()
            }
        }
    }

    private func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}
