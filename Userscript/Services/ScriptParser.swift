import Foundation

public struct ScriptParser {
    public static func parse(content: String, sourceUrl: String? = nil) -> UserScript {
        var cleanContent = content
        // Strip UTF-8 BOM if present
        if cleanContent.hasPrefix("\u{FEFF}") {
            cleanContent = String(cleanContent.dropFirst())
        }

        var name = "Untitled Script"
        var namespace = ""
        var version = "1.0.0"
        var description = ""
        var author = ""
        var matches: [String] = []
        var includes: [String] = []
        var excludes: [String] = []
        var grants: [String] = []
        var requires: [String] = []
        var resources: [UserScript.ScriptResource] = []
        var runAt: UserScript.RunAt = .documentEnd
        var noframes = false
        var iconURL: String? = nil
        var updateUrl: String? = nil
        var downloadUrl: String? = nil
        var configFields: [UserScript.ScriptConfigField] = []
        var spaMode: UserScript.SPANavigationMode = .runOncePerPage
        var group: String? = nil
        var trustLevel: UserScript.TrustLevel = .local

        let lines = cleanContent.components(separatedBy: .newlines)
        var insideHeader = false

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.contains("// ==UserScript==") {
                insideHeader = true
                continue
            }
            if trimmed.contains("// ==/UserScript==") {
                insideHeader = false
                break
            }

            if insideHeader && trimmed.hasPrefix("//") {
                let directiveLine = trimmed.dropFirst(2).trimmingCharacters(in: .whitespaces)
                if directiveLine.hasPrefix("@") {
                    let parts = directiveLine.dropFirst().split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
                    guard let keyPart = parts.first else { continue }
                    let key = String(keyPart).lowercased()
                    let value = parts.count > 1 ? String(parts[1]).trimmingCharacters(in: .whitespaces) : ""

                    switch key {
                    case "name":
                        if !value.isEmpty { name = value }
                    case "namespace":
                        namespace = value
                    case "version":
                        if !value.isEmpty { version = value }
                    case "description":
                        description = value
                    case "author":
                        author = value
                    case "match":
                        if !value.isEmpty && !matches.contains(value) { matches.append(value) }
                    case "include":
                        if !value.isEmpty && !includes.contains(value) { includes.append(value) }
                    case "exclude":
                        if !value.isEmpty && !excludes.contains(value) { excludes.append(value) }
                    case "grant":
                        if !value.isEmpty && !grants.contains(value) { grants.append(value) }
                    case "require":
                        if !value.isEmpty && !requires.contains(value) { requires.append(value) }
                    case "resource":
                        let resParts = value.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
                        if resParts.count == 2 {
                            let resName = String(resParts[0]).trimmingCharacters(in: .whitespaces)
                            let resUrl = String(resParts[1]).trimmingCharacters(in: .whitespaces)
                            if !resName.isEmpty && !resUrl.isEmpty {
                                resources.append(UserScript.ScriptResource(name: resName, url: resUrl))
                            }
                        }
                    case "run-at":
                        switch value.lowercased() {
                        case "document-start": runAt = .documentStart
                        case "document-body": runAt = .documentBody
                        case "document-end": runAt = .documentEnd
                        case "document-idle": runAt = .documentIdle
                        default: break
                        }
                    case "noframes":
                        noframes = true
                    case "icon", "iconurl", "defaulticon":
                        if !value.isEmpty { iconURL = value }
                    case "downloadurl":
                        if !value.isEmpty { downloadUrl = value }
                    case "updateurl":
                        if !value.isEmpty { updateUrl = value }
                    case "config":
                        // Syntax: @config key:type:label:default[:opt1,opt2]
                        let segs = value.components(separatedBy: ":")
                        if segs.count >= 4 {
                            let k = segs[0].trimmingCharacters(in: .whitespaces)
                            let t = segs[1].trimmingCharacters(in: .whitespaces)
                            let l = segs[2].trimmingCharacters(in: .whitespaces)
                            let d = segs[3].trimmingCharacters(in: .whitespaces)
                            let opts = segs.count > 4 ? segs[4].components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) } : nil
                            let fieldType = UserScript.ScriptConfigField.ConfigType(rawValue: t) ?? .text
                            configFields.append(UserScript.ScriptConfigField(key: k, label: l, type: fieldType, defaultValue: d, options: opts))
                        }
                    case "spa":
                        switch value.lowercased() {
                        case "page": spaMode = .runOncePerPage
                        case "url": spaMode = .runOncePerUrl
                        case "navigation", "always": spaMode = .runOnEveryNavigation
                        default: break
                        }
                    case "group":
                        if !value.isEmpty { group = value }
                    case "trust":
                        if let tl = UserScript.TrustLevel(rawValue: value) { trustLevel = tl }
                    default:
                        break
                    }
                }
            }
        }

        if matches.isEmpty && includes.isEmpty {
            matches.append("*://*/*")
        }

        return UserScript(
            name: name,
            namespace: namespace,
            version: version,
            description: description,
            author: author,
            enabled: true,
            priority: 100,
            favorite: false,
            tags: [],
            group: group,
            content: cleanContent,
            matches: matches,
            includes: includes,
            excludes: excludes,
            grants: grants.isEmpty ? ["none"] : grants,
            requires: requires,
            resources: resources,
            runAt: runAt,
            noframes: noframes,
            iconURL: iconURL,
            sourceUrl: sourceUrl,
            updateUrl: updateUrl,
            downloadUrl: downloadUrl,
            configSchema: configFields,
            trustLevel: trustLevel,
            spaMode: spaMode
        )
    }

    /// Generates a standardized metadata block string for saving
    public static func generateHeader(for script: UserScript) -> String {
        var lines: [String] = ["// ==UserScript=="]
        lines.append("// @name         \(script.name)")
        if !script.namespace.isEmpty { lines.append("// @namespace    \(script.namespace)") }
        lines.append("// @version      \(script.version)")
        if !script.description.isEmpty { lines.append("// @description  \(script.description)") }
        if !script.author.isEmpty { lines.append("// @author       \(script.author)") }
        if let icon = script.iconURL, !icon.isEmpty { lines.append("// @icon         \(icon)") }
        
        for m in script.matches { lines.append("// @match        \(m)") }
        for inc in script.includes { lines.append("// @include      \(inc)") }
        for exc in script.excludes { lines.append("// @exclude      \(exc)") }
        for g in script.grants { lines.append("// @grant        \(g)") }
        for req in script.requires { lines.append("// @require      \(req)") }
        for res in script.resources { lines.append("// @resource     \(res.name) \(res.url)") }
        
        lines.append("// @run-at       \(script.runAt.rawValue)")
        if script.noframes { lines.append("// @noframes") }
        if let update = script.updateUrl { lines.append("// @updateURL    \(update)") }
        if let download = script.downloadUrl { lines.append("// @downloadURL  \(download)") }
        
        lines.append("// ==/UserScript==")
        return lines.joined(separator: "\n")
    }
}
