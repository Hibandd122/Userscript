import Foundation

public struct ScriptParser {
    public static func parse(content: String, sourceUrl: String? = nil) -> UserScript {
        var name = "Untitled Script"
        var version = "1.0.0"
        var description = ""
        var author = ""
        var matches: [String] = []
        var includes: [String] = []
        var excludes: [String] = []
        var grants: [String] = []
        var runAt: UserScript.RunAt = .documentEnd
        var updateUrl: String? = nil
        var downloadUrl: String? = nil

        let lines = content.components(separatedBy: .newlines)
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
                    if let key = parts.first {
                        let value = parts.count > 1 ? String(parts[1]).trimmingCharacters(in: .whitespaces) : ""
                        switch key.lowercased() {
                        case "name":
                            if !value.isEmpty { name = value }
                        case "version":
                            if !value.isEmpty { version = value }
                        case "description":
                            description = value
                        case "author":
                            author = value
                        case "match":
                            if !value.isEmpty { matches.append(value) }
                        case "include":
                            if !value.isEmpty { includes.append(value) }
                        case "exclude":
                            if !value.isEmpty { excludes.append(value) }
                        case "grant":
                            if !value.isEmpty { grants.append(value) }
                        case "run-at":
                            switch value.lowercased() {
                            case "document-start": runAt = .documentStart
                            case "document-body": runAt = .documentBody
                            case "document-end": runAt = .documentEnd
                            case "document-idle": runAt = .documentIdle
                            default: break
                            }
                        case "downloadurl":
                            downloadUrl = value
                        case "updateurl":
                            updateUrl = value
                        default:
                            break
                        }
                    }
                }
            }
        }

        if matches.isEmpty && includes.isEmpty {
            matches.append("*://*/*")
        }

        return UserScript(
            name: name,
            version: version,
            description: description,
            author: author,
            enabled: true,
            content: content,
            matches: matches,
            includes: includes,
            excludes: excludes,
            grants: grants.isEmpty ? ["none"] : grants,
            runAt: runAt,
            sourceUrl: sourceUrl,
            updateUrl: updateUrl,
            downloadUrl: downloadUrl
        )
    }
}
