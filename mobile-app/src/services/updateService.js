import * as Updates from "expo-updates";
import { Alert } from "react-native";

/**
 * Check and download Over-The-Air (OTA) updates using Expo Updates.
 * @param {boolean} promptUser - Whether to show a prompt alert when update is downloaded.
 */
export async function checkForAppUpdates(promptUser = false) {
  if (__DEV__) {
    return { isAvailable: false, isDev: true };
  }

  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      console.log("[EAS Update] New OTA update found, downloading in background...");
      const fetchResult = await Updates.fetchUpdateAsync();

      if (fetchResult.isNew) {
        console.log("[EAS Update] New bundle successfully downloaded.");

        if (promptUser) {
          Alert.alert(
            "New Update Available",
            "A new update has been downloaded. Would you like to reopen the app to apply the latest changes now?",
            [
              { text: "Later", style: "cancel" },
              {
                text: "Reopen Now",
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
