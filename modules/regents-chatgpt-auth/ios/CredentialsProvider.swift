import Foundation

public protocol CredentialsProvider: Sendable {
  func currentCredentials() async throws -> Credentials
}

extension Credentials {
  public func asProvider() -> CredentialsProvider {
    StaticCredentialsProvider(credentials: self)
  }
}

struct StaticCredentialsProvider: CredentialsProvider {
  let credentials: Credentials

  func currentCredentials() async throws -> Credentials {
    credentials
  }
}

public actor RefreshingCredentialsProvider: CredentialsProvider {
  public typealias Refresh = @Sendable (Credentials) async throws -> Credentials

  private var credentials: Credentials
  private let store: CredentialsStore?
  private let buffer: TimeInterval
  private let refreshFn: Refresh
  private var refreshTask: Task<Credentials, Error>?

  public init(
    credentials: Credentials,
    store: CredentialsStore? = nil,
    buffer: TimeInterval = 5 * 60,
    refresh: @escaping Refresh = { try await OAuthClient.refresh(credentials: $0) }
  ) {
    self.credentials = credentials
    self.store = store
    self.buffer = buffer
    self.refreshFn = refresh
  }

  public func currentCredentials() async throws -> Credentials {
    if !credentials.isExpired(buffer: buffer) {
      return credentials
    }
    if let task = refreshTask {
      return try await task.value
    }

    let current = credentials
    let refresh = refreshFn
    let task = Task<Credentials, Error> {
      try await refresh(current)
    }
    refreshTask = task

    do {
      let updated = try await task.value
      refreshTask = nil
      credentials = updated
      if let store {
        try store.save(updated)
      }
      return updated
    } catch {
      refreshTask = nil
      throw error
    }
  }

  public func update(_ credentials: Credentials) throws {
    self.credentials = credentials
    if let store {
      try store.save(credentials)
    }
  }
}
