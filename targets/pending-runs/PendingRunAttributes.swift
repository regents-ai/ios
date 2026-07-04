// STAGED — NOT BUILT YET. Compiles into the PendingRuns widget extension once
// the target is enabled (see expo-target.config.js). The companion app-side
// ActivityKit module ("RegentsLiveActivity", proposed as a local Expo module)
// must declare a byte-identical copy of this type: ActivityKit matches the
// attributes between app and extension by type name and Codable shape.
//
// REDACTION CONTRACT: this is a mirror of RedactedRun from
// utils/liveActivityModel.ts — the ONLY projection the app ever hands to
// ActivityKit. No field for a full address or a raw amount exists here, so
// the lock screen structurally cannot show one.

import ActivityKit
import Foundation

struct PendingRunAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// "send" | "onramp" | "staking" — RunKind in the TS model.
        var kind: String
        /// "pending" | "progressing" | "settled" | "failed" | "stale".
        var phase: String
        /// 0...1, already throttled by the TS model (>= 1s between updates).
        var progress: Double
        /// e.g. "…a1b2" — last-4 hint, never the full address.
        var counterpartyHint: String?
        /// "small" | "medium" | "large" — coarse bucket, never a raw amount.
        var amountBucket: String?
    }

    /// Run id (mirrors RedactedRun.id) so the app can reconcile orphans.
    var runId: String
}
