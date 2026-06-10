import Foundation
import Security

public struct CredentialsStore: @unchecked Sendable {
  public let service: String
  public let account: String
  public let accessibility: CFString
  public let accessGroup: String?

  public init(
    service: String = "ChatGPTAuthKit",
    account: String = "chatgpt-oauth",
    accessibility: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    accessGroup: String? = nil
  ) {
    self.service = service
    self.account = account
    self.accessibility = accessibility
    self.accessGroup = accessGroup
  }

  public func save(_ credentials: Credentials) throws {
    let data = try JSONEncoder().encode(credentials)
    var query = baseQuery
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: accessibility
    ]

    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess {
      return
    }
    if updateStatus != errSecItemNotFound {
      throw KeychainError(status: updateStatus, operation: "update")
    }

    query.merge(attributes) { _, new in new }
    let addStatus = SecItemAdd(query as CFDictionary, nil)
    if addStatus != errSecSuccess {
      throw KeychainError(status: addStatus, operation: "add")
    }
  }

  public func load() -> Credentials? {
    var query = baseQuery
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else {
      return nil
    }
    return try? JSONDecoder().decode(Credentials.self, from: data)
  }

  public func clear() {
    SecItemDelete(baseQuery as CFDictionary)
  }

  private var baseQuery: [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account
    ]
    if let accessGroup {
      query[kSecAttrAccessGroup as String] = accessGroup
    }
    return query
  }
}

public struct KeychainError: Error, LocalizedError, Sendable {
  public let status: OSStatus
  public let operation: String

  public var errorDescription: String? {
    let message = SecCopyErrorMessageString(status, nil) as String? ?? "unknown"
    return "Keychain \(operation) failed (\(status)): \(message)"
  }
}
