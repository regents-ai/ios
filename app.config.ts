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
          './assets/fonts/Geist-Regular.ttf',
        ],
      }],
      // Light launch screen to match the app; the dark variant only shows when
      // the device itself is in dark mode, the same rule every other screen uses.
      ['expo-splash-screen', {
        image: './assets/images/icon-regents-light.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#fafafa',
        dark: { image: './assets/images/splash-icon-regents.png', backgroundColor: '#0a0a0a' },
      }],
      ['expo-build-properties', { ios: { deploymentTarget: '16.0' } }],
      ['expo-notifications', {
        icon: './assets/images/icon.png',
        color: '#0052FF'
      }],
      ['expo-image-picker', {
        photosPermission: 'Choose a QR code photo to fill in the send recipient.',
        // The app never records audio, so no microphone permission is declared.
        // The camera string must match expo-camera's so both plugins agree.
        cameraPermission: 'Regents uses the camera to read a QR code with a wallet address.',
        microphonePermission: false,
      }],
      ['expo-camera', {
        cameraPermission: 'Regents uses the camera to read a QR code with a wallet address.',
        recordAudioAndroid: false,
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
