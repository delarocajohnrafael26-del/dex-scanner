import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.c1b94fd6ec2e4ca282c2ffe71685d60c",
  appName: "Expiry Tracker",
  webDir: "dist",
  // Standalone mode: the APK bundles the built web app and runs offline.
  // (No `server.url` — that would make the APK depend on the Lovable sandbox.)
  android: {
    allowMixedContent: false,
  },
};

export default config;
