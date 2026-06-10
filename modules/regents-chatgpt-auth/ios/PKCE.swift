import CryptoKit
import Foundation

enum PKCE {
  static func generateVerifier() -> String {
    randomBase64URL(byteCount: 32)
  }

  static func challenge(for verifier: String) -> String {
    let hash = SHA256.hash(data: Data(verifier.utf8))
    return Data(hash).base64URLEncodedString()
  }

  static func randomState(byteCount: Int = 32) -> String {
    randomBase64URL(byteCount: byteCount)
  }

  private static func randomBase64URL(byteCount: Int) -> String {
    var bytes = [UInt8](repeating: 0, count: byteCount)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    precondition(status == errSecSuccess, "SecRandomCopyBytes failed: \(status)")
    return Data(bytes).base64URLEncodedString()
  }
}

extension Data {
  fileprivate func base64URLEncodedString() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
