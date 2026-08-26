import * as Updates from "expo-updates";
import { Alert } from "react-native";

/**
 * Check and download Over-The-Air (OTA) updates silently on app launch.
 * @param {boolean} promptUser - Whether to show a prompt alert when update is downloaded.
 */
export async function checkForAppUpdates(promptUser = true) {
  if (__DEV__) {
    return { isAvailable: false, isDev: true };
  }

  try {
    if (!Updates.isEnabled) {
      console.log("[EAS Update] Updates are disabled in this build environment.");
      return { isAvailable: false, isEnabled: false };
    }

    console.log(
      `[EAS Update] Checking for updates (Channel: ${Updates.channel || "default"}, Runtime: ${Updates.runtimeVersion})...`
    );
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      console.log("[EAS Update] New OTA update found, downloading in background...");
      const fetchResult = await Updates.fetchUpdateAsync();

      if (fetchResult.isNew) {
        console.log("[EAS Update] New bundle successfully downloaded.");

        if (promptUser) {
          Alert.alert(
            "🚀 New Update Available",
            "A new version with the latest improvements has been downloaded. Restart the app now to apply it?",
            [
              {
                text: "Restart Now",
                onPress: async () => {
                  try {
                    await Updates.reloadAsync();
                  } catch (e) {
                    console.warn("[EAS Update] Reload error:", e);
                  }
                },
              },
            ]
          );
        }

        return { isAvailable: true, downloaded: true };
      }
    }

    return { isAvailable: false, downloaded: false };
  } catch (error) {
    console.warn("[EAS Update] Update check non-critical error:", error?.message);
  }
}

/**
 * Lightweight check to see if an OTA update is pending on server.
 * @returns {Promise<boolean>}
 */
export async function checkIfUpdateAvailable() {
  if (__DEV__ || !Updates.isEnabled) {
    return false;
  }
  try {
    const update = await Updates.checkForUpdateAsync();
    return Boolean(update?.isAvailable);
  } catch (err) {
    return false;
  }
}

/**
 * Manually trigger update check from UI (e.g. from Profile Screen).
 */
export async function manualCheckForUpdates() {
  if (__DEV__ || !Updates.isEnabled) {
    Alert.alert(
      "Development Environment",
      "Over-The-Air updates are only available in standalone installed APK builds."
    );
    return { isAvailable: false };
  }

  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      const fetchResult = await Updates.fetchUpdateAsync();

      if (fetchResult.isNew) {
        Alert.alert(
          "✨ Update Ready",
          "The latest version has been downloaded successfully. The app will now reload to apply all changes.",
          [
            {
              text: "Apply & Reload",
              onPress: async () => {
                try {
                  await Updates.reloadAsync();
                } catch (e) {
                  console.warn("[EAS Update] Reload error:", e);
                }
              },
            },
          ]
        );
        return { isAvailable: true, downloaded: true };
      }
    }

    Alert.alert("✅ Up to Date", "You are already using the latest version of Trucode ERP.");
    return { isAvailable: false, downloaded: false };
  } catch (error) {
    console.error("[EAS Update] Manual update check error:", error);
    Alert.alert(
      "Update Check Failed",
      error?.message || "Could not check for updates. Please verify your internet connection."
    );
    return { isAvailable: false, error: error?.message };
  }
}

/**
 * Get current EAS update metadata (ID, channel, runtimeVersion).
 */
export function getUpdateMetadata() {
  try {
    return {
      updateId: Updates.updateId || "embedded",
      channel: Updates.channel || "default",
      runtimeVersion: Updates.runtimeVersion || "1.0.0",
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      createdAt: Updates.createdAt ? new Date(Updates.createdAt).toISOString() : null,
    };
  } catch (e) {
    return { updateId: "unknown" };
  }
}

