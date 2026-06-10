import Foundation

enum JWT {
  static func extractAccountID(fromAccessToken token: String) -> String? {
    guard let payload = decodePayload(token) else { return nil }
    if let id = payload.auth?.chatgptAccountID, !id.isEmpty { return id }
    if let id = payload.chatgptAccountID, !id.isEmpty { return id }
    if let id = payload.organizations?.first?.id, !id.isEmpty { return id }
    return nil
  }

  static func extractPlanType(fromAccessToken token: String) -> String? {
    guard let payload = decodePayload(token) else { return nil }
    if let plan = payload.auth?.chatgptPlanType, !plan.isEmpty { return plan }
    return payload.chatgptPlanType
  }

  private struct Payload: Decodable {
    let auth: AuthClaims?
    let chatgptAccountID: String?
    let chatgptPlanType: String?
    let organizations: [Org]?

    enum CodingKeys: String, CodingKey {
      case auth = "https://api.openai.com/auth"
      case chatgptAccountID = "chatgpt_account_id"
      case chatgptPlanType = "chatgpt_plan_type"
      case organizations
    }
  }

  private struct AuthClaims: Decodable {
    let chatgptAccountID: String?
    let chatgptPlanType: String?

    enum CodingKeys: String, CodingKey {
      case chatgptAccountID = "chatgpt_account_id"
      case chatgptPlanType = "chatgpt_plan_type"
    }
  }

  private struct Org: Decodable {
    let id: String?
  }

  private static func decodePayload(_ token: String) -> Payload? {
    let parts = token.split(separator: ".")
    guard parts.count == 3 else { return nil }
    var payload = String(parts[1])
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = payload.count % 4
    if remainder > 0 {
      payload += String(repeating: "=", count: 4 - remainder)
    }
    guard let data = Data(base64Encoded: payload) else { return nil }
    return try? JSONDecoder().decode(Payload.self, from: data)
  }
}
