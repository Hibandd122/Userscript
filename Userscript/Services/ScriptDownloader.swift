import Foundation

public final class ScriptDownloader {
    public enum DownloadError: LocalizedError {
        case invalidURL
        case networkError(String)
        case emptyContent
        
        public var errorDescription: String? {
            switch self {
            case .invalidURL: return "The provided URL is invalid."
            case .networkError(let msg): return "Network error: \(msg)"
            case .emptyContent: return "The downloaded script file is empty."
            }
        }
    }

    public static func fetch(from urlString: String) async throws -> (script: UserScript, rawCode: String) {
        var cleanURLString = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Handle GreasyFork user script URLs: convert display URL to raw user.js URL
        if cleanURLString.contains("greasyfork.org") && !cleanURLString.hasSuffix(".user.js") {
            if let scriptID = cleanURLString.components(separatedBy: "scripts/").last?.components(separatedBy: "-").first,
               let id = Int(scriptID) {
                cleanURLString = "https://update.greasyfork.org/scripts/\(id)/script.user.js"
            }
        }

        // Handle GitHub blob URL to raw URL
        if cleanURLString.contains("github.com") && cleanURLString.contains("/blob/") {
            cleanURLString = cleanURLString
                .replacingOccurrences(of: "github.com", with: "raw.githubusercontent.com")
                .replacingOccurrences(of: "/blob/", with: "/")
        }

        guard let url = URL(string: cleanURLString) else {
            throw DownloadError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 20

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                throw DownloadError.networkError("HTTP status code \(httpResponse.statusCode)")
            }

            guard let content = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .ascii) else {
                throw DownloadError.emptyContent
            }

            guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw DownloadError.emptyContent
            }

            let parsedScript = ScriptParser.parse(content: content, sourceUrl: cleanURLString)
            return (parsedScript, content)
        } catch {
            throw DownloadError.networkError(error.localizedDescription)
        }
    }
}
