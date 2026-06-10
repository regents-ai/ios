import Foundation

public actor OAuthFlow {
  public enum FlowError: Error, LocalizedError, Sendable {
    case stateMismatch
    case oauthError(String, String?)
    case noCode
    case timedOut
    case cancelled
    case presentationFailed(String)
    case server(String)

    public var errorDescription: String? {
      switch self {
      case .stateMismatch:
        return "OAuth state mismatch."
      case .oauthError(let code, let description):
        return "Provider rejected: \(code)\(description.map { " - \($0)" } ?? "")"
      case .noCode:
        return "Authorization code missing from callback."
      case .timedOut:
        return "Login timed out."
      case .cancelled:
        return "Login cancelled."
      case .presentationFailed(let detail):
        return "Browser presentation failed: \(detail)"
      case .server(let detail):
        return "Loopback server failed: \(detail)"
      }
    }
  }

  public let originator: String
  public let timeout: TimeInterval

  public init(
    originator: String = "codex_cli_rs",
    timeout: TimeInterval = 5 * 60
  ) {
    self.originator = originator
    self.timeout = timeout
  }

  public func run(
    present: @escaping @Sendable (URL, @escaping @Sendable () async -> Void) async throws -> Void,
    onComplete: @escaping @Sendable () async -> Void = {}
  ) async throws -> Credentials {
    let (url, verifier, state) = OAuthClient.buildAuthorizationURL(originator: originator)
    let server = LoopbackServer(port: OAuthClient.callbackPort)
    let cancellationState = FlowCancellationState()

    do {
      try await server.start()
    } catch {
      throw FlowError.server(error.localizedDescription)
    }

    do {
      try await present(url) {
        await cancellationState.markCancelled()
        await server.stop()
      }
    } catch {
      await server.stop()
      throw FlowError.presentationFailed(error.localizedDescription)
    }

    let timeoutTask = Task { [timeout] in
      try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
      await server.stop()
    }

    let query: [String: String]
    do {
      query = try await server.waitForCallback()
      timeoutTask.cancel()
    } catch is CancellationError {
      timeoutTask.cancel()
      await onComplete()
      if await cancellationState.wasCancelled {
        throw FlowError.cancelled
      }
      throw FlowError.timedOut
    } catch {
      timeoutTask.cancel()
      await server.stop()
      await onComplete()
      throw FlowError.server(error.localizedDescription)
    }

    await server.stop()
    await onComplete()

    if let error = query["error"] {
      throw FlowError.oauthError(error, query["error_description"])
    }
    guard query["state"] == state else {
      throw FlowError.stateMismatch
    }
    guard let code = query["code"], !code.isEmpty else {
      throw FlowError.noCode
    }

    return try await OAuthClient.exchangeCode(code: code, verifier: verifier)
  }
}

private actor FlowCancellationState {
  private var cancelled = false

  var wasCancelled: Bool {
    cancelled
  }

  func markCancelled() {
    cancelled = true
  }
}
