import ExpoModulesCore
import SafariServices
import UIKit

final class SafariPresenter: NSObject, SFSafariViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  private var safariViewController: SFSafariViewController?
  private var onCancel: (@Sendable () async -> Void)?

  func present(
    url: URL,
    appContext: AppContext?,
    onCancel: @escaping @Sendable () async -> Void
  ) async throws {
    try await MainActor.run {
      guard safariViewController == nil else {
        throw SafariPresenterError.alreadyPresenting
      }

      let viewController = SFSafariViewController(url: url)
      viewController.modalPresentationStyle = .pageSheet
      viewController.delegate = self
      viewController.presentationController?.delegate = self

      guard let presenter = appContext?.utilities?.currentViewController()
        ?? UIApplication.shared.regentsChatGptTopViewController() else {
        throw SafariPresenterError.noPresenter
      }

      self.onCancel = onCancel
      self.safariViewController = viewController
      presenter.present(viewController, animated: true)
    }
  }

  func dismiss() async {
    await MainActor.run {
      let viewController = safariViewController
      onCancel = nil
      safariViewController = nil
      viewController?.dismiss(animated: true)
    }
  }

  func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
    completeWithCancel()
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    completeWithCancel()
  }

  private func completeWithCancel() {
    let cancel = onCancel
    onCancel = nil
    safariViewController = nil
    if let cancel {
      Task {
        await cancel()
      }
    }
  }
}

enum SafariPresenterError: Error, LocalizedError {
  case alreadyPresenting
  case noPresenter

  var errorDescription: String? {
    switch self {
    case .alreadyPresenting:
      return "Sign-in is already open."
    case .noPresenter:
      return "Regents could not open ChatGPT sign-in."
    }
  }
}

private extension UIApplication {
  func regentsChatGptTopViewController() -> UIViewController? {
    let root = connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }?
      .rootViewController

    var current = root
    while let presented = current?.presentedViewController {
      current = presented
    }
    return current
  }
}
