// STAGED — NOT BUILT YET. Lock-screen + Dynamic Island UI for pending-run
// Live Activities. Enabled together with expo-target.config.js in this
// directory. Renders ONLY the redacted content state (PendingRunAttributes):
// a last-4 counterparty hint and a coarse amount bucket — never a full
// address or a raw amount.

import ActivityKit
import SwiftUI
import WidgetKit

@main
struct PendingRunsBundle: WidgetBundle {
    var body: some Widget {
        PendingRunsLiveActivity()
    }
}

// MARK: - Copy helpers (customer-facing, no internal language)

private func title(for state: PendingRunAttributes.ContentState) -> String {
    switch (state.kind, state.phase) {
    case (_, "stale"): return "Status unknown"
    case (_, "settled"): return "Done"
    case (_, "failed"): return "Didn't go through"
    case ("send", _): return "Sending payment"
    case ("onramp", _): return "Adding funds"
    case ("staking", _): return "Updating stake"
    default: return "Working on it"
    }
}

private func subtitle(for state: PendingRunAttributes.ContentState) -> String? {
    if state.phase == "stale" {
        return "Open the app for the latest."
    }
    var parts: [String] = []
    if let bucket = state.amountBucket {
        switch bucket {
        case "small": parts.append("Small amount")
        case "medium": parts.append("Medium amount")
        case "large": parts.append("Large amount")
        default: break
        }
    }
    if let hint = state.counterpartyHint {
        parts.append("to \(hint)")
    }
    return parts.isEmpty ? nil : parts.joined(separator: " ")
}

private func symbolName(for kind: String) -> String {
    switch kind {
    case "send": return "paperplane.fill"
    case "onramp": return "plus.circle.fill"
    case "staking": return "lock.fill"
    default: return "clock.fill"
    }
}

private func isLive(_ phase: String) -> Bool {
    phase == "pending" || phase == "progressing"
}

// MARK: - Shared views

private struct RunStatusView: View {
    let state: PendingRunAttributes.ContentState
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 4 : 8) {
            HStack(spacing: 8) {
                Image(systemName: symbolName(for: state.kind))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.tint)
                Text(title(for: state))
                    .font(compact ? .subheadline : .headline)
                    .contentTransition(.opacity)
                Spacer(minLength: 0)
                if state.phase == "stale" {
                    Image(systemName: "questionmark.circle")
                        .foregroundStyle(.secondary)
                }
            }
            if isLive(state.phase) {
                ProgressView(value: state.progress)
                    .progressViewStyle(.linear)
                    .tint(.accentColor)
            }
            if let subtitle = subtitle(for: state) {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Live Activity

struct PendingRunsLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PendingRunAttributes.self) { context in
            // Lock screen / banner.
            RunStatusView(state: context.state)
                .padding(16)
                .activityBackgroundTint(Color.black.opacity(0.8))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: symbolName(for: context.state.kind))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.tint)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    RunStatusView(state: context.state, compact: true)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.phase == "stale" {
                        Text("Open the app for the latest.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: symbolName(for: context.state.kind))
                    .foregroundStyle(.tint)
            } compactTrailing: {
                if isLive(context.state.phase) {
                    ProgressView(value: context.state.progress)
                        .progressViewStyle(.circular)
                        .tint(.accentColor)
                } else {
                    Image(systemName: context.state.phase == "stale" ? "questionmark" : "checkmark")
                        .foregroundStyle(.secondary)
                }
            } minimal: {
                Image(systemName: symbolName(for: context.state.kind))
                    .foregroundStyle(.tint)
            }
        }
    }
}
