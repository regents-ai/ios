import Foundation

public enum OAuthClient {
  public static let authEndpoint = "https://auth.openai.com/oauth/authorize"
  public static let tokenEndpoint = "https://auth.openai.com/oauth/token"
  public static let clientID = "app_EMoamEEZ73f0CkXaXp7hrann"
  public static let redirectURI = "http://localhost:1455/auth/callback"
  public static let scopes = "openid profile email offline_access"
  public static let callbackPort: UInt16 = 1455

  public enum AuthError: Error, LocalizedError, Sendable {
    case tokenExchangeFailed(Int)
    case invalidTokenResponse

    public var errorDescription: String? {
      switch self {
      case .tokenExchangeFailed(let status):
        return "Token endpoint returned \(status)"
      case .invalidTokenResponse:
        return "Invalid token response"
      }
    }
  }

  private struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int

    enum CodingKeys: String, CodingKey {
      case accessToken = "access_token"
      case refreshToken = "refresh_token"
      case expiresIn = "expires_in"
    }
  }

  public static func buildAuthorizationURL(
    originator: String = "codex_cli_rs"
  ) -> (url: URL, verifier: String, state: String) {
    let verifier = PKCE.generateVerifier()
    let challenge = PKCE.challenge(for: verifier)
    let state = PKCE.randomState()

    var components = URLComponents(string: authEndpoint)!
    components.queryItems = [
      URLQueryItem(name: "client_id", value: clientID),
      URLQueryItem(name: "redirect_uri", value: redirectURI),
      URLQueryItem(name: "response_type", value: "code"),
      URLQueryItem(name: "scope", value: scopes),
      URLQueryItem(name: "state", value: state),
      URLQueryItem(name: "code_challenge", value: challenge),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
      URLQueryItem(name: "codex_cli_simplified_flow", value: "true"),
      URLQueryItem(name: "originator", value: originator)
    ]
    return (components.url!, verifier, state)
  }

  public static func exchangeCode(code: String, verifier: String) async throws -> Credentials {
    let body = formEncode([
      "grant_type": "authorization_code",
      "client_id": clientID,
      "code": code,
      "redirect_uri": redirectURI,
      "code_verifier": verifier
    ])
    let token = try await postToken(body: body)
    return makeCredentials(from: token, currentRefreshToken: nil, currentAccountID: nil)
  }

  public static func refresh(credentials: Credentials) async throws -> Credentials {
    let body = formEncode([
      "grant_type": "refresh_token",
      "client_id": clientID,
      "refresh_token": credentials.refreshToken
    ])
    let token = try await postToken(body: body)
    return makeCredentials(
      from: token,
      currentRefreshToken: credentials.refreshToken,
      currentAccountID: credentials.accountID
    )
  }

  private static func postToken(body: Data) async throws -> TokenResponse {
    var request = URLRequest(url: URL(string: tokenEndpoint)!)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    request.httpBody = body

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw AuthError.invalidTokenResponse
    }
    guard http.statusCode == 200 else {
      throw AuthError.tokenExchangeFailed(http.statusCode)
    }
    do {
      return try JSONDecoder().decode(TokenResponse.self, from: data)
    } catch {
      throw AuthError.invalidTokenResponse
    }
  }

  private static func makeCredentials(
    from token: TokenResponse,
    currentRefreshToken: String?,
    currentAccountID: String?
  ) -> Credentials {
    let refresh = (token.refreshToken?.isEmpty == false ? token.refreshToken : nil)
      ?? currentRefreshToken ?? ""
    let accountID = JWT.extractAccountID(fromAccessToken: token.accessToken)
      ?? currentAccountID ?? ""
    return Credentials(
      accessToken: token.accessToken,
      refreshToken: refresh,
      expiresAt: Date().addingTimeInterval(TimeInterval(token.expiresIn)),
      accountID: accountID
    )
  }

  private static func formEncode(_ pairs: [String: String]) -> Data {
    let encoded = pairs.map { key, value in
      let encodedKey = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key
      let encodedValue = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
      return "\(encodedKey)=\(encodedValue)"
    }.joined(separator: "&")
    return Data(encoded.utf8)
  }
}

public struct Credentials: Hashable, Sendable, Codable {
  public var accessToken: String
  public var refreshToken: String
  public var expiresAt: Date
  public var accountID: String

  public init(accessToken: String, refreshToken: String, expiresAt: Date, accountID: String) {
    self.accessToken = accessToken
    self.refreshToken = refreshToken
    self.expiresAt = expiresAt
    self.accountID = accountID
  }

  public func isExpired(buffer: TimeInterval = 5 * 60) -> Bool {
    expiresAt.timeIntervalSinceNow <= buffer
  }

  public var planType: String? {
    JWT.extractPlanType(fromAccessToken: accessToken)
  }
}
