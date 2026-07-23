import 'dotenv/config';
import { ExpoConfig } from 'expo/config';
 
const withGooglePayWebView = require('./plugins/withGooglePayWebView');

const config: ExpoConfig = {
    name: 'Regents Mobile',
    slug: 'regents-mobile',
    version: '1.1.1',
    scheme: 'regentsmobile',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    icon: './assets/images/icon-regents.png',

    ios: {
      bundleIdentifier: 'com.regentslabs.mobile',
      supportsTablet: false,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSMicrophoneUsageDescription: 'Regents uses the microphone and speech recognition to turn your voice into a message draft.',
        NSCameraUsageDescription: 'Scan the pairing QR code shown by your local Hermes to connect voice.',
        NSLocalNetworkUsageDescription: 'Regents uses this to return you to the app after ChatGPT sign-in.',
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
        },
        UIBackgroundModes: ['fetch', 'remote-notification'],
        // Live Activities for pending runs (send / onramp settlement / staking).
        // The lock-screen widget target itself is staged in targets/pending-runs
        // pending the provisioning decision; these keys are decision-free.
        NSSupportsLiveActivities: true,
        NSSupportsLiveActivitiesFrequentUpdates: true,
      }
    },

    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon-regents.png',
        backgroundColor: '#0a0a0a'
      },
      edgeToEdgeEnabled: true,
      package: "com.regentslabs.mobile"
    },

    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png'
    },

    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-localization',
      ['expo-font', {
        fonts: [
          './assets/fonts/GeistPixel-Circle.woff2',
          './assets/fonts/GeistPixel-Square.woff2',
        ],
      }],
      ['expo-splash-screen', { image: './assets/images/splash-icon-regents.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#0a0a0a' }],
      ['expo-build-properties', { ios: { deploymentTarget: '16.0' } }],
      ['expo-notifications', {
        icon: './assets/images/icon.png',
        color: '#0052FF'
      }],
      ['expo-image-picker', {
        photosPermission: 'Choose a QR code photo to fill in the send recipient.',
        // Never pass `false` here: the image-picker plugin deletes the key from
        // the built Info.plist, wiping the mic/camera strings set above and by
        // expo-camera. Set the same strings so every plugin agrees.
        cameraPermission: 'Scan the pairing QR code shown by your local Hermes to connect voice.',
        microphonePermission: 'Regents uses the microphone and speech recognition to turn your voice into a message draft.',
      }],
      ['expo-camera', {
        cameraPermission: 'Scan the pairing QR code shown by your local Hermes to connect voice.',
        recordAudioAndroid: false,
      }],
      ['expo-speech-recognition', {
        microphonePermission: 'Regents uses the microphone and speech recognition to turn your voice into a message draft.',
        speechRecognitionPermission: 'Regents uses the microphone and speech recognition to turn your voice into a message draft.',
      }],
      ['expo-alternate-app-icons', [
        { name: 'Light', ios: './assets/images/icon-regents-light.png' },
        { name: 'Blue', ios: './assets/images/icon-regents-blue.png' },
      ]],
      withGooglePayWebView,
    ],

    experiments: { typedRoutes: true },

    // Good hygiene if you later use EAS Update
    runtimeVersion: { policy: 'sdkVersion' },

    extra: {
      eas: {
        projectId: '981ff535-f8bf-4fac-97ef-1cdbc9038e85'
      }
    }
};

export default config;
