/**
 * STAGED — NOT BUILT YET.
 *
 * Widget-extension target for pending-run Live Activities, in the shape
 * @bacons/expo-apple-targets expects. Nothing references this directory until
 * two approved steps land (Sean's call — provisioning + a new bundle id):
 *
 *   1. `npx expo install @bacons/expo-apple-targets`
 *   2. app.config.ts: add '@bacons/expo-apple-targets' to plugins and set
 *      `ios.appleTeamId` (required by the plugin to sign the extension).
 *
 * The extension bundle id becomes `com.regentslabs.mobile.pending-runs`
 * (derived from the app id + directory name). Live Activities need NO App
 * Group and NO push entitlement in this design — the app process drives every
 * update through ActivityKit locally.
 */
/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'PendingRuns',
  deploymentTarget: '16.2',
  colors: {
    $accent: '#0052FF',
  },
};
