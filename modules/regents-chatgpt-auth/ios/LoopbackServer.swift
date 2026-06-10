import Foundation
import Network
import os

private let loopbackLogger = Logger(subsystem: "com.regentslabs.mobile", category: "chatgpt-loopback")

public actor LoopbackServer {
  public enum ServerError: Error, LocalizedError, Sendable {
    case listenFailed(String)

    public var errorDescription: String? {
      switch self {
      case .listenFailed(let detail):
        return "Loopback listen failed: \(detail)"
      }
    }
  }

  private static let queue = DispatchQueue(label: "RegentsChatGptAuth.loopback")

  private let port: NWEndpoint.Port
  private var listeners: [NWListener] = []
  private var readyContinuation: CheckedContinuation<Void, Error>?
  private var callbackContinuation: CheckedContinuation<[String: String], Error>?
  private var pendingResult: Result<[String: String], Error>?
  private var anyReady = false
  private var didFinish = false

  public init(port: UInt16) {
    self.port = NWEndpoint.Port(rawValue: port)!
  }

  public func start() async throws {
    guard listeners.isEmpty else { return }
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      self.readyContinuation = continuation
      do {
        let v4 = try makeListener(host: .ipv4(.loopback))
        let v6 = try makeListener(host: .ipv6(.loopback))
        self.listeners = [v4, v6]
        v4.start(queue: Self.queue)
        v6.start(queue: Self.queue)
      } catch {
        self.readyContinuation = nil
        continuation.resume(throwing: ServerError.listenFailed(String(describing: error)))
      }
    }
  }

  public func waitForCallback() async throws -> [String: String] {
    if let result = pendingResult {
      pendingResult = nil
      return try result.get()
    }
    return try await withCheckedThrowingContinuation { continuation in
      self.callbackContinuation = continuation
    }
  }

  public func stop() {
    for listener in listeners {
      listener.cancel()
    }
    listeners = []
    if let continuation = readyContinuation {
      readyContinuation = nil
      continuation.resume(throwing: CancellationError())
    }
    if let continuation = callbackContinuation {
      callbackContinuation = nil
      continuation.resume(throwing: CancellationError())
    }
    didFinish = true
  }

  private func makeListener(host: NWEndpoint.Host) throws -> NWListener {
    let parameters = NWParameters.tcp
    parameters.allowLocalEndpointReuse = true
    parameters.requiredLocalEndpoint = .hostPort(host: host, port: port)
    let listener = try NWListener(using: parameters)
    listener.newConnectionHandler = { [weak self] connection in
      guard let self else { return }
      Task { await self.handle(connection: connection) }
    }
    listener.stateUpdateHandler = { [weak self] state in
      loopbackLogger.info("listener state=\(String(describing: state))")
      guard let self else { return }
      Task { await self.onStateChange(state) }
    }
    return listener
  }

  private func onStateChange(_ state: NWListener.State) {
    switch state {
    case .ready:
      if !anyReady {
        anyReady = true
        if let continuation = readyContinuation {
          readyContinuation = nil
          continuation.resume()
        }
      }
    case .failed(let error):
      if !anyReady {
        let wrapped = ServerError.listenFailed(String(describing: error))
        if let continuation = readyContinuation {
          readyContinuation = nil
          continuation.resume(throwing: wrapped)
        } else {
          finish(.failure(wrapped))
        }
      }
    default:
      break
    }
  }

  private func handle(connection: NWConnection) {
    connection.start(queue: Self.queue)
    readRequest(connection, accumulated: Data())
  }

  private nonisolated func readRequest(_ connection: NWConnection, accumulated: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
      guard let self else { return }
      if let error {
        loopbackLogger.error("receive error: \(String(describing: error))")
        connection.cancel()
        return
      }

      var buffer = accumulated
      if let data {
        buffer.append(data)
      }
      if let terminator = "\r\n\r\n".data(using: .utf8), buffer.range(of: terminator) != nil {
        Task { await self.respond(to: connection, request: buffer) }
        return
      }
      if isComplete {
        connection.cancel()
        return
      }
      if buffer.count >= 64 * 1024 {
        Self.respondAndClose(connection, status: "413 Payload Too Large", body: "Request too large")
        return
      }
      self.readRequest(connection, accumulated: buffer)
    }
  }

  private func respond(to connection: NWConnection, request: Data) {
    guard let text = String(data: request, encoding: .utf8),
          let firstLine = text.split(separator: "\r\n").first else {
      Self.respondAndClose(connection, status: "400 Bad Request", body: "Bad request")
      return
    }

    let parts = firstLine.split(separator: " ")
    guard parts.count >= 2, parts[0] == "GET" else {
      Self.respondAndClose(connection, status: "405 Method Not Allowed", body: "Method not allowed")
      return
    }

    let path = String(parts[1])
    guard path.hasPrefix("/auth/callback") else {
      Self.respondAndClose(connection, status: "404 Not Found", body: "Not found")
      return
    }

    let query = Self.parseQuery(path: path)
    let html = """
    <!doctype html><html><head><meta charset="utf-8"><title>Done</title>
    <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:40px;color:#222}h2{color:#10a37f}</style>
    </head><body>
    <h2>Sign-in complete</h2>
    <p>You can return to Regents.</p>
    </body></html>
    """
    Self.respondAndClose(connection, status: "200 OK", body: html, contentType: "text/html; charset=utf-8") { [weak self] in
      guard let self else { return }
      Task { await self.finish(.success(query)) }
    }
  }

  static func parseQuery(path: String) -> [String: String] {
    guard let queryIndex = path.firstIndex(of: "?") else { return [:] }
    let queryString = path[path.index(after: queryIndex)...]
    var result: [String: String] = [:]
    for pair in queryString.split(separator: "&") {
      let keyValue = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      let key = String(keyValue[0]).removingPercentEncoding ?? String(keyValue[0])
      let value = keyValue.count > 1 ? (String(keyValue[1]).removingPercentEncoding ?? String(keyValue[1])) : ""
      result[key] = value
    }
    return result
  }

  private static func respondAndClose(
    _ connection: NWConnection,
    status: String,
    body: String,
    contentType: String = "text/plain; charset=utf-8",
    onSent: (@Sendable () -> Void)? = nil
  ) {
    let bodyData = Data(body.utf8)
    var header = ""
    header += "HTTP/1.1 \(status)\r\n"
    header += "Content-Type: \(contentType)\r\n"
    header += "Content-Length: \(bodyData.count)\r\n"
    header += "Connection: close\r\n"
    header += "\r\n"

    var response = Data(header.utf8)
    response.append(bodyData)

    connection.send(content: response, isComplete: false, completion: .contentProcessed { error in
      if let error {
        loopbackLogger.error("send error: \(String(describing: error))")
        connection.cancel()
        onSent?()
        return
      }

      connection.send(content: nil, isComplete: true, completion: .contentProcessed { _ in
        connection.cancel()
        onSent?()
      })
    })
  }

  private func finish(_ result: Result<[String: String], Error>) {
    guard !didFinish else { return }
    didFinish = true
    for listener in listeners {
      listener.cancel()
    }
    listeners = []

    if let continuation = callbackContinuation {
      callbackContinuation = nil
      switch result {
      case .success(let value):
        continuation.resume(returning: value)
      case .failure(let error):
        continuation.resume(throwing: error)
      }
    } else {
      pendingResult = result
    }
  }
}
