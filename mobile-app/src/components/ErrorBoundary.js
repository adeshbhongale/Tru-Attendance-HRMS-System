import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      checkingUpdate: false,
      updateStatus: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, info) {
    console.error('💥 [ErrorBoundary] Fatal Render Error:', error?.message || error);
    console.error('💥 [ErrorBoundary] Component Stack:', info?.componentStack);
    // When a crash occurs, automatically attempt to fetch a new OTA fix from server
    this.autoRecoverWithUpdate();
  }

  autoRecoverWithUpdate = async () => {
    try {
      this.setState({ checkingUpdate: true, updateStatus: 'Checking for newer update to recover...' });
      const { checkForRecoveryUpdate } = require('../services/updateService');
      const result = await checkForRecoveryUpdate();
      if (result?.reloaded) {
        return;
      }
      this.setState({
        checkingUpdate: false,
        updateStatus: result?.isAvailable
          ? 'New update downloaded! Reloading app...'
          : 'App is currently running fallback safe mode. Tap below to retry or restart.'
      });
    } catch (_) {
      this.setState({ checkingUpdate: false, updateStatus: null });
    }
  };

  handleManualRestart = async () => {
    try {
      const Updates = require('expo-updates');
      if (Updates.reloadAsync) {
        await Updates.reloadAsync();
      }
    } catch (e) {
      Alert.alert('Restart App', 'Please close the app from your recent apps screen and reopen it.');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView
          contentContainerStyle={styles.container}
        >
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>⚠️</Text>
            </View>

            <Text style={styles.title}>
              App Recovering
            </Text>

            <Text style={styles.subtitle}>
              An unexpected error occurred. The app is protecting your session in safe mode while checking for fixes.
            </Text>

            {this.state.updateStatus ? (
              <View style={styles.statusBox}>
                {this.state.checkingUpdate && (
                  <ActivityIndicator size="small" color="#4f46e5" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.statusText}>{this.state.updateStatus}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={this.autoRecoverWithUpdate}
              disabled={this.state.checkingUpdate}
            >
              {this.state.checkingUpdate ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Check For Latest Fix & Reload</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={this.handleManualRestart}
            >
              <Text style={styles.secondaryButtonText}>Restart App</Text>
            </TouchableOpacity>

            <Text style={styles.errorDetails}>
              {String(this.state.error?.message || this.state.error || 'Unknown error')}
            </Text>
          </View>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  content: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    width: '100%',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 13,
    color: '#4338ca',
    fontWeight: '500',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '500',
  },
  errorDetails: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default ErrorBoundary;
