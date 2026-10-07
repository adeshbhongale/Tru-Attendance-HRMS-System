const admin = require('firebase-admin');

let firebaseAdminApp = null;
let isMockMode = false;

const fs = require('fs');
const path = require('path');

// Determine if we can initialize Firebase Admin
let serviceAccountCert = null;

try {
  // Prioritize raw JSON string variable first for seamless containerized/cloud hosting
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccountCert = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      // Parse error ignored silently
    }
  }

  // Fallback to inline credentials if no file was loaded
  if (!serviceAccountCert && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccountCert = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }

  if (serviceAccountCert) {
    firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountCert),
    });
  } else {
    isMockMode = true;
  }
} catch (error) {
  isMockMode = true;
}

/**
 * Send push notification to a single FCM token
 */
const sendToSingleDevice = async (token, title, body, data = {}) => {
  if (!token) return { success: false, error: 'No FCM token provided' };

  const stringifiedData = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null) {
        stringifiedData[k] = String(v);
      }
    }
  }
  stringifiedData.openNotifications = 'true';
  stringifiedData.screen = stringifiedData.screen || 'Main';

  const payload = {
    notification: { title, body },
    data: stringifiedData,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default',
        defaultSound: true,
        defaultVibrateTimings: true,
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
    token: token
  };

  if (isMockMode) {
    // Simulate minor delay
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { success: true, messageId: `mock-msg-${Math.random().toString(36).substr(2, 9)}` };
  }

  try {
    const fcmCallPromise = admin.messaging().send(payload);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('FCM request timed out after 2.5s')), 2500)
    );
    const response = await Promise.race([fcmCallPromise, timeoutPromise]);
    return { success: true, messageId: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Send push notifications to multiple FCM tokens in bulk
 */
const sendMulticast = async (tokens, title, body, data = {}) => {
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    return { success: false, error: 'No tokens provided' };
  }

  // Filter out null/undefined tokens
  const validTokens = tokens.filter(t => !!t);
  if (validTokens.length === 0) {
    return { success: false, error: 'No valid tokens provided' };
  }

  if (isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      success: true,
      responses: validTokens.map(t => ({ success: true, token: t, messageId: `mock-msg-${Math.random().toString(36).substr(2, 9)}` })),
      successCount: validTokens.length,
      failureCount: 0
    };
  }

  const stringifiedData = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && v !== null) {
        stringifiedData[k] = String(v);
      }
    }
  }
  stringifiedData.openNotifications = 'true';
  stringifiedData.screen = stringifiedData.screen || 'Main';

  try {
    const message = {
      notification: { title, body },
      data: stringifiedData,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      tokens: validTokens,
    };

    const fcmCallPromise = admin.messaging().sendEachForMulticast(message);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('FCM request timed out after 2.5s')), 2500)
    );
    const response = await Promise.race([fcmCallPromise, timeoutPromise]);

    const results = response.responses.map((resp, idx) => ({
      token: validTokens[idx],
      success: resp.success,
      messageId: resp.messageId || null,
      error: resp.error ? resp.error.message : null,
    }));

    return {
      success: true,
      responses: results,
      successCount: response.successCount,
      failureCount: response.failureCount
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to a Firebase Topic
 */
const sendToTopic = async (topic, title, body, data = {}) => {
  if (!topic) return { success: false, error: 'No topic specified' };

  const payload = {
    notification: { title, body },
    data: data,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
    topic: topic
  };

  if (isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { success: true, messageId: `mock-topic-msg-${Math.random().toString(36).substr(2, 9)}` };
  }

  try {
    const fcmCallPromise = admin.messaging().send(payload);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('FCM request timed out after 2.5s')), 2500)
    );
    const response = await Promise.race([fcmCallPromise, timeoutPromise]);
    return { success: true, messageId: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendToSingleDevice,
  sendMulticast,
  sendToTopic,
  isMockMode: () => isMockMode
};
