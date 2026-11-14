import type { ExpoConfig } from 'expo/config';

/**
 * School ERP mobile app.
 *
 * No secrets live here. The API address comes from the environment (`EXPO_PUBLIC_API_URL`),
 * set per build profile in eas.json or in a local `.env` file. When it is not set, a
 * development build falls back to the local API (see src/api/config.ts).
 */
const TEAL = '#0e5e61';
const TEAL_DARK = '#0a2f32';

const config: ExpoConfig = {
  name: 'School ERP',
  slug: 'school-erp',
  scheme: 'schoolerp',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: TEAL,
  ios: {
    bundleIdentifier: 'com.schoolerp.app',
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.schoolerp.app',
    adaptiveIcon: {
      backgroundColor: TEAL,
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-local-authentication',
      { faceIDPermission: 'Use Face ID to unlock School ERP.' },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        backgroundColor: TEAL,
        dark: {
          image: './assets/images/splash-icon.png',
          backgroundColor: TEAL_DARK,
        },
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? null,
  },
};

export default config;
