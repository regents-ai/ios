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
    icon: './assets/images/onrampV2Icon.png',

    ios: {
      bundleIdentifier: 'com.regentslabs.mobile',
      supportsTablet: false,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSMicrophoneUsageDescription: 'Talk to Hermes with your voice.',
        UIBackgroundModes: ['fetch', 'remote-notification'],
      }
    },

    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff'
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
      ['expo-splash-screen', { image: './assets/images/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#ffffff' }],
      ['expo-build-properties', { ios: { deploymentTarget: '16.0' } }],
      ['expo-notifications', {
        icon: './assets/images/icon.png',
        color: '#0052FF'
      }],
      ['expo-image-picker', {
        photosPermission: 'Choose a QR code photo to fill in the send recipient.',
        cameraPermission: false,
        microphonePermission: false,
      }],
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
