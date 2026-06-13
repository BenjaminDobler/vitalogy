import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vitalogy.mobile',
  appName: 'Vitalogy',
  // After `npm run build:mobile`, Angular emits to dist/apps/mobile/browser.
  // Capacitor copies this into the native iOS/Android projects on `cap sync`.
  webDir: '../../dist/apps/mobile/browser',
  // Bluetooth scanning UX prompt overrides
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Scanning for sensors…',
        cancel: 'Stop',
        availableDevices: 'Available sensors',
        noDeviceFound: 'No sensors found',
      },
    },
  },
};

export default config;
