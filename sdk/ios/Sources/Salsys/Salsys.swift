import Foundation

public struct SalsysConfig {
    public let sourceKey: String
    public let baseURL: URL
    public let site: String?
    public let debug: Bool

    public init(
        sourceKey: String,
        baseURL: URL = URL(string: "https://salsysos.com")!,
        site: String? = nil,
        debug: Bool = false
    ) {
        self.sourceKey = sourceKey
        self.baseURL = baseURL
        self.site = site
        self.debug = debug
    }
}

/// Salsys iOS SDK V1.
///
/// `sourceKey` is intentionally publishable. Never embed a Salsys trusted
/// server-source secret in an iOS binary. Payments, enrollments, refunds and
/// other authoritative business facts belong on the trusted server Events API.
public final class Salsys {
    public static let shared = Salsys()

    private let sdkName = "salsys-ios"
    private let sdkVersion = "1.0.0"
    private let defaults = UserDefaults.standard
    private let queue = DispatchQueue(label: "com.salsys.sdk.v1")
    private let session = URLSession(configuration: .ephemeral)

    private let visitorKey = "salsys_ios_visitor_v1"
    private let consentKey = "salsys_ios_consent_v1"
    private let eventQueueKey = "salsys_ios_queue_v1"

    private var config: SalsysConfig?
    private var sessionID = Self.randomID(prefix: "s")
    private var ephemeralVisitorID = Self.randomID(prefix: "v")

    private init() {}

    public func configure(_ config: SalsysConfig) {
        precondition(!config.sourceKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        queue.sync {
            self.config = config
            self.sessionID = Self.randomID(prefix: "s")
            self.ephemeralVisitorID = Self.randomID(prefix: "v")
        }
        flush()
    }

    public func newSession() {
        requireConfigured()
        queue.sync { sessionID = Self.randomID(prefix: "s") }
    }

    public func visitorID() -> String {
        requireConfigured()
        return queue.sync { persistentVisitorID() ?? ephemeralVisitorID }
    }

    public func currentSessionID() -> String {
        requireConfigured()
        return queue.sync { sessionID }
    }

    public func consent() -> [String: String] {
        guard let raw = defaults.dictionary(forKey: consentKey) else { return [:] }
        return raw.reduce(into: [String: String]()) { result, item in
            if let value = item.value as? String { result[item.key] = value }
        }
    }

    public func setConsent(_ decisions: [String: String], gpc: Bool = false) {
        requireConfigured()

        let allowedPurposes = Set([
            "analytics", "marketing", "advertising", "sale_sharing", "personalization"
        ])
        let allowedDecisions = Set([
            "granted", "denied", "withdrawn", "opted_out", "limited"
        ])

        var normalized = decisions.reduce(into: [String: String]()) { result, item in
            let key = item.key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let value = item.value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if allowedPurposes.contains(key) && allowedDecisions.contains(value) {
                result[key] = value
            }
        }
        if gpc { normalized["sale_sharing"] = "opted_out" }

        defaults.set(normalized, forKey: consentKey)

        queue.sync {
            if normalized["analytics"] == "granted" && persistentVisitorID() == nil {
                defaults.set(ephemeralVisitorID, forKey: visitorKey)
            }
            if ["denied", "withdrawn", "opted_out"].contains(normalized["analytics"] ?? "") {
                defaults.removeObject(forKey: visitorKey)
                defaults.removeObject(forKey: eventQueueKey)
            }
        }

        let body: [String: Any] = [
            "event_id": Self.randomID(prefix: "consent"),
            "visitor_id": visitorID(),
            "platform": "ios",
            "gpc": gpc,
            "occurred_at": Self.isoNow(),
            "decisions": normalized,
        ]

        post(path: "/api/privacy/consent/client/v1", body: body) { [weak self] ok in
            if ok && self?.analyticsGranted() == true { self?.flush() }
        }
    }

    public func track(
        _ eventName: String,
        properties: [String: Any?] = [:],
        context: [String: Any?] = [:]
    ) {
        requireConfigured()
        let normalized = eventName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        precondition(normalized.range(of: "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$", options: .regularExpression) != nil)
        precondition(normalized.hasPrefix("app."), "iOS publishable SDK accepts app.* telemetry only")

        guard analyticsGranted() else {
            debug("blocked by analytics consent: \(normalized)")
            return
        }

        let safeProperties = sanitizeDictionary(properties)
        var safeContext = sanitizeDictionary(context)
        safeContext["platform"] = "ios"
        if let bundle = Bundle.main.bundleIdentifier { safeContext["app_bundle_id"] = bundle }
        if let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String {
            safeContext["app_version"] = version
        }

        var envelope: [String: Any] = [
            "event_id": Self.randomID(prefix: "evt"),
            "event_name": normalized,
            "schema_version": 1,
            "occurred_at": Self.isoNow(),
            "anonymous_visitor_id": visitorID(),
            "session_key": currentSessionID(),
            "properties": safeProperties,
            "context": safeContext,
            "metadata": [
                "sdk": [
                    "name": sdkName,
                    "version": sdkVersion,
                    "integration": "native_ios",
                ],
                "platform": "ios",
            ],
        ]
        if let site = config?.site, !site.isEmpty {
            envelope["site"] = site
        }

        enqueue(envelope)
        flush()
    }

    public func flush() {
        guard config != nil, analyticsGranted() else { return }
        queue.async { [weak self] in
            guard let self else { return }
            let events = self.readQueue()
            guard !events.isEmpty else { return }

            let group = DispatchGroup()
            let lock = NSLock()
            var remaining: [[String: Any]] = []

            for event in events {
                group.enter()
                self.post(path: "/api/events/client/v1", body: event) { ok in
                    if !ok {
                        lock.lock()
                        remaining.append(event)
                        lock.unlock()
                    }
                    group.leave()
                }
            }

            group.wait()
            self.writeQueue(Array(remaining.suffix(100)))
        }
    }

    private func requireConfigured() {
        precondition(config != nil, "Call Salsys.shared.configure(...) before using the SDK")
    }

    private func analyticsGranted() -> Bool {
        consent()["analytics"] == "granted"
    }

    private func persistentVisitorID() -> String? {
        defaults.string(forKey: visitorKey)
    }

    private func enqueue(_ event: [String: Any]) {
        queue.sync {
            var events = readQueue()
            events.append(event)
            writeQueue(Array(events.suffix(100)))
        }
    }

    private func readQueue() -> [[String: Any]] {
        guard let data = defaults.data(forKey: eventQueueKey),
              let value = try? JSONSerialization.jsonObject(with: data),
              let rows = value as? [[String: Any]] else {
            return []
        }
        return rows
    }

    private func writeQueue(_ events: [[String: Any]]) {
        guard let data = try? JSONSerialization.data(withJSONObject: events) else { return }
        defaults.set(data, forKey: eventQueueKey)
    }

    private func post(path: String, body: [String: Any], completion: @escaping (Bool) -> Void) {
        guard let config else {
            completion(false)
            return
        }

        let endpoint = config.baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.sourceKey, forHTTPHeaderField: "X-Salsys-Source-Key")
        guard JSONSerialization.isValidJSONObject(body),
              let requestBody = try? JSONSerialization.data(withJSONObject: body) else {
            completion(false)
            return
        }
        request.httpBody = requestBody

        session.dataTask(with: request) { [weak self] _, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let ok = error == nil && (200...299).contains(status)
            self?.debug("POST \(path) -> \(status)\(error == nil ? "" : " error")")
            completion(ok)
        }.resume()
    }

    private func sanitizeDictionary(_ input: [String: Any?]) -> [String: Any] {
        let forbidden = Set([
            "email", "email_address", "phone", "phone_number", "mobile", "first_name",
            "last_name", "full_name", "name", "address", "street", "postal_code", "zip",
            "dob", "date_of_birth", "person_id", "lead_id", "customer_id", "user_id",
            "password", "authorization", "cookie", "secret", "token", "access_token",
            "refresh_token", "api_key", "ip", "ip_address",
        ])

        var result: [String: Any] = [:]
        for (rawKey, rawValue) in input.prefix(100) {
            let key = String(rawKey.prefix(120))
            if forbidden.contains(key.lowercased()) {
                result[key] = "[redacted]"
            } else if let safe = sanitizeValue(rawValue, depth: 0) {
                result[key] = safe
            }
        }
        return result
    }

    private func sanitizeValue(_ value: Any?, depth: Int) -> Any? {
        if depth > 6 { return "[max_depth]" }
        guard let value else { return NSNull() }
        switch value {
        case let value as String:
            return String(value.prefix(2000))
        case is Bool, is Int, is Double, is Float, is NSNumber:
            return value
        case let value as [String: Any?]:
            return sanitizeDictionary(value)
        case let value as [Any?]:
            return value.prefix(50).compactMap { sanitizeValue($0, depth: depth + 1) }
        default:
            return String(String(describing: value).prefix(1000))
        }
    }

    private func debug(_ message: String) {
        if config?.debug == true { print("[Salsys] \(message)") }
    }

    private static func randomID(prefix: String) -> String {
        "\(prefix)_\(UUID().uuidString.lowercased())"
    }

    private static func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}
