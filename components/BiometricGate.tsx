import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import BiometricSetupScreen from '@/screens/BiometricSetupScreen';

interface BiometricGateProps {
  children: React.ReactNode;
}

export default function BiometricGate({ children }: BiometricGateProps) {
  const { 
    user, 
    biometricAuthenticated, 
    biometricEnabled, 
    biometricSetupCompleted, 
    authenticateWithBiometrics,
    checkBiometricStatus,
  } = useAuth();
  
  const [showSetup, setShowSetup] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (user && biometricSetupCompleted && !showSetup) {
      checkAuthenticationStatus();
    }
  }, [user, biometricSetupCompleted, biometricEnabled]);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground, require biometric authentication again if enabled
      if (user && biometricEnabled && biometricSetupCompleted) {
        checkAuthenticationStatus();
      }
    }
    setAppState(nextAppState);
  };

  const checkAuthenticationStatus = async () => {
    await checkBiometricStatus();
    
    if (biometricEnabled && !biometricAuthenticated) {
      // Automatically attempt biometric authentication
      handleBiometricAuth();
    }
  };

  const handleBiometricAuth = async () => {
    setAuthenticating(true);
    const success = await authenticateWithBiometrics();
    setAuthenticating(false);

    if (!success) {
      Alert.alert(
        'Authentication Required',
        'You need to authenticate to access your messages.',
        [
          {
            text: 'Try Again',
            onPress: handleBiometricAuth,
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    checkAuthenticationStatus();
  };

  // Show setup screen if user is logged in but hasn't completed biometric setup
  if (user && !biometricSetupCompleted) {
    return (
      <BiometricSetupScreen onSetupComplete={handleSetupComplete} />
    );
  }

  // If biometric is enabled but user is not authenticated, show auth screen
  if (user && biometricEnabled && !biometricAuthenticated) {
    return (
      <View style={styles.authContainer}>
        <View style={styles.authContent}>
          <Text style={styles.authIcon}>🔒</Text>
          <Text style={styles.authTitle}>Authentication Required</Text>
          <Text style={styles.authSubtitle}>
            Please authenticate to access your secure messages
          </Text>
          
          <TouchableOpacity
            style={styles.authButton}
            onPress={handleBiometricAuth}
            disabled={authenticating}
          >
            <Text style={styles.authButtonText}>
              {authenticating ? 'Authenticating...' : 'Authenticate'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // If user is authenticated or biometric is disabled, show the app
  return <>{children}</>;
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  authContent: {
    alignItems: 'center',
    maxWidth: 300,
  },
  authIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  authSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  authButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 200,
  },
  authButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});