import SwiftUI

public struct DomainManagementView: View {
    @ObservedObject var manager = ScriptManager.shared
    @State private var showingAddSheet = false
    @State private var newDomain = ""
    @State private var newAction: DomainRule.RuleAction = .block
    @State private var selectedDuration = 0 // 0 = permanent, 5 = 5m, 60 = 1h, 1440 = 24h

    public init() {}

    public var body: some View {
        NavigationView {
            List {
                Section(header: Text("Domain Rules Priority")) {
                    Text("Rules are evaluated with priority: Global Killswitch → Temporary Overrides → Domain Rules → Script Patterns.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Section(header: Text("Active Rules (\(manager.domainRules.count))")) {
                    if manager.domainRules.isEmpty {
                        Text("No domain rules configured. All matched scripts execute normally.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.vertical, 8)
                    } else {
                        ForEach(manager.domainRules) { rule in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(rule.domainPattern)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                    if let expires = rule.expiresAt {
                                        Text("Expires: \(expires.formatted(date: .omitted, time: .standard))")
                                            .font(.caption2)
                                            .foregroundColor(.orange)
                                    } else {
                                        Text("Permanent Rule")
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                Text(rule.action.rawValue)
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(ruleColor(for: rule.action).opacity(0.15))
                                    .foregroundColor(ruleColor(for: rule.action))
                                    .cornerRadius(6)
                            }
                        }
                        .onDelete { offsets in
                            for index in offsets {
                                manager.removeDomainRule(manager.domainRules[index])
                            }
                        }
                    }
                }
            }
            .navigationTitle("Domain Control")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingAddSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                NavigationView {
                    Form {
                        Section(header: Text("Domain Target")) {
                            TextField("e.g. mangadex.org, *.youtube.com", text: $newDomain)
                                .autocapitalization(.none)
                                .disableAutocorrection(true)
                        }

                        Section(header: Text("Action")) {
                            Picker("Rule Action", selection: $newAction) {
                                ForEach(DomainRule.RuleAction.allCases, id: \.self) { act in
                                    Text(act.rawValue).tag(act)
                                }
                            }
                            .pickerStyle(.segmented)
                        }

                        Section(header: Text("Duration")) {
                            Picker("Expires in", selection: $selectedDuration) {
                                Text("Permanent").tag(0)
                                Text("5 Minutes").tag(5)
                                Text("1 Hour").tag(60)
                                Text("24 Hours (Today)").tag(1440)
                            }
                        }
                    }
                    .navigationTitle("Add Domain Rule")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showingAddSheet = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add") {
                                if !newDomain.trimmingCharacters(in: .whitespaces).isEmpty {
                                    let dur = selectedDuration > 0 ? selectedDuration : nil
                                    manager.addDomainRule(pattern: newDomain.trimmingCharacters(in: .whitespaces), action: newAction, durationMinutes: dur)
                                    newDomain = ""
                                    showingAddSheet = false
                                }
                            }
                            .disabled(newDomain.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    private func ruleColor(for action: DomainRule.RuleAction) -> Color {
        switch action {
        case .allow, .tempAllow: return .green
        case .block, .tempBlock: return .red
        }
    }
}
