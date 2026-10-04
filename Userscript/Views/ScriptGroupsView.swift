import SwiftUI

public struct ScriptGroupsView: View {
    @ObservedObject var manager = ScriptManager.shared

    public init() {}

    public var body: some View {
        List {
            Section(header: Text("Groups & Categories")) {
                Text("Organize scripts into functional collections with bulk toggling capabilities.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section(header: Text("Active Groups (\(manager.groups.count))")) {
                ForEach(manager.groups) { group in
                    let groupScripts = manager.scripts.filter { $0.group == group.id }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: group.icon)
                                .font(.title3)
                                .foregroundColor(.blue)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(group.name)
                                    .font(.headline)
                                Text(group.description)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Text("\(groupScripts.count) scripts")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        HStack(spacing: 12) {
                            Button("Enable All") {
                                manager.toggleGroup(groupId: group.id, enable: true)
                            }
                            .font(.caption)
                            .buttonStyle(.bordered)

                            Button("Disable All") {
                                manager.toggleGroup(groupId: group.id, enable: false)
                            }
                            .font(.caption)
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Script Groups")
    }
}
