import React from 'react';
import { ScrollView, Text, View } from 'react-native';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
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
  }

  render() {
    if (this.state.hasError) {
      return (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: 20,
            backgroundColor: 'white',
          }}
        >
          <View className="items-center">
             <Text
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: 'red',
                marginBottom: 20,
              }}
            >
              App Crash Detected
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: '#333',
                textAlign: 'center'
              }}
            >
              {String(this.state.error)}
            </Text>
            
            <Text style={{ marginTop: 20, color: '#666', fontSize: 12 }}>
               Please check the terminal logs for more details.
            </Text>
          </View>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
