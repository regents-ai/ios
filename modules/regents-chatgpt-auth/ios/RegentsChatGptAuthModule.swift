import ExpoModulesCore
import Foundation

public final class RegentsChatGptAuthModule: Module {
  private let store = CredentialsStore(
    service: "com.regentslabs.mobile.chatgpt",
    account: "chatgpt-oauth"
  )
  private let formatter = ISO8601DateFormatter()

  public func definition() -> ModuleDefinition {
    Name("RegentsChatGptAuth")

    AsyncFunction("signIn") { (promise: Promise) in
      Task {
        do {
          let presenter = SafariPresenter()
          let flow = OAuthFlow(originator: "regents_mobile_ios")
          let credentials = try await flow.run { [weak self] url, onCancel in
            try await presenter.present(url: url, appContext: self?.appContext, onCancel: onCancel)
          } onComplete: {
            await presenter.dismiss()
          }
          try self.store.save(credentials)
          promise.resolve(self.sessionPayload(credentials))
        } catch {
          promise.reject("ERR_CHATGPT_SIGN_IN", Self.publicErrorMessage(for: error))
        }
      }
    }

    AsyncFunction("getSession") { () -> [String: Any]? in
      guard let credentials = self.store.load() else {
        return nil
      }
      return self.sessionPayload(credentials)
    }

    AsyncFunction("refreshSession") { (promise: Promise) in
      Task {
        guard let credentials = self.store.load() else {
          promise.resolve(nil)
          return
        }

        guard !credentials.refreshToken.isEmpty else {
          self.store.clear()
          promise.resolve(nil)
          return
        }

        do {
          let provider = RefreshingCredentialsProvider(credentials: credentials, store: self.store, buffer: 0)
          let refreshed = try await provider.currentCredentials()
          promise.resolve(self.sessionPayload(refreshed))
        } catch {
          promise.reject("ERR_CHATGPT_REFRESH", Self.publicErrorMessage(for: error))
        }
      }
    }

    AsyncFunction("signOut") {
      self.store.clear()
    }
  }

  private func sessionPayload(_ credentials: Credentials) -> [String: Any] {
    [
      "accountId": credentials.accountID,
      "planType": credentials.planType ?? NSNull(),
      "expiresAt": formatter.string(from: credentials.expiresAt),
      "isSignedIn": true
    ]
  }

  private static func publicErrorMessage(for error: Error) -> String {
    if let flowError = error as? OAuthFlow.FlowError {
      switch flowError {
      case .cancelled:
        return "ChatGPT sign-in was canceled."
      case .timedOut:
        return "ChatGPT sign-in took too long. Please try again."
      case .presentationFailed:
        return "Regents could not open ChatGPT sign-in."
      default:
        return "ChatGPT sign-in could not finish. Please try again."
      }
    }

    if error is SafariPresenterError {
      return "Regents could not open ChatGPT sign-in."
    }

    return "ChatGPT sign-in could not finish. Please try again."
  }
}
