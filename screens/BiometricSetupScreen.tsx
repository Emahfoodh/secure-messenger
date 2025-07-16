import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { BiometricService, BiometricCapabilities } from '@/services/biometricService';

interface BiometricSetupScreenProps {
  onSetupComplete: () => void;
}

export default function BiometricSetupScreen({ onSetupComplete }: BiometricSetupScreenProps) {
  const [capabilities, setCapabilities] = useState<BiometricCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    checkCapabilities();
  }, []);

  const checkCapabilities = async () => {
    setLoading(true);
    const caps = await BiometricService.checkBiometricCapabilities();
    setCapabilities(caps);
    setLoading(false);
  };

  const handleEnableBiometrics = async () => {
    if (!capabilities?.hasHardware || !capabilities?.isEnrolled) {
      Alert.alert(
        'Setup Required',
        'Please set up biometric authentication in your device settings first.',
        [{ text: 'OK' }]
      );
      return;
    }

    setTesting(true);
    const result = await BiometricService.authenticateAsync({
      promptMessage: 'Test your biometric authentication',
      cancelLabel: 'Cancel',
    });

    setTesting(false);

    if (result.success) {
      await BiometricService.setBiometricEnabled(true);
      await BiometricService.setBiometricSetupCompleted(true);
      
      Alert.alert(
        'Success!',
        `Biometric authentication has been enabled successfully using ${result.biometricType}.`,
        [
          {
            text: 'Continue',
            onPress: onSetupComplete,
          },
        ]
      );
    } else {
      Alert.alert('Authentication Failed', result.error || 'Please try again.');
    }
  };

  const handleSkip = async () => {
    await BiometricService.setBiometricEnabled(false);
    await BiometricService.setBiometricSetupCompleted(true);
    
    Alert.alert(
      'Biometric Authentication Skipped',
      'You can enable biometric authentication later in your profile settings.',
      [
        {
          text: 'Continue',
          onPress: onSetupComplete,
        },
      ]
    );
  };

  const getBiometricIcon = () => {
    if (!capabilities?.availableTypes.length) return '🔒';
    
    const types = capabilities.availableTypes;
    if (types.includes(1)) return '👆'; // Fingerprint
    if (types.includes(2)) return '👤'; // Face ID
    if (types.includes(3)) return '👁️'; // Iris
    return '🔒';
  };

  const getBiometricTitle = () => {
    if (!capabilities?.hasHardware) return 'Biometric Authentication';
    
    const typeNames = BiometricService.getBiometricTypeNames(capabilities.availableTypes);
    if (typeNames.length === 0) return 'Biometric Authentication';
    
    return `${typeNames.join(' & ')} Authentication`;
  };

  const getStatusMessage = () => {
    if (!capabilities?.hasHardware) {
      return 'Biometric authentication is not available on this device.';
    }
    
    if (!capabilities?.isEnrolled) {
      return 'No biometric credentials found. Please set up biometrics in your device settings.';
    }
    
    return 'Your device supports biometric authentication. Enable it for quick and secure access to your messages.';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Checking device capabilities...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.icon}>{getBiometricIcon()}</Text>
        <Text style={styles.title}>{getBiometricTitle()}</Text>
        <Text style={styles.subtitle}>{getStatusMessage()}</Text>
      </View>

      <View style={styles.featuresContainer}>
        <Text style={styles.featuresTitle}>Benefits:</Text>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>⚡</Text>
          <Text style={styles.featureText}>Quick access to your messages</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>🔐</Text>
          <Text style={styles.featureText}>Enhanced security protection</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>🛡️</Text>
          <Text style={styles.featureText}>Protect sensitive conversations</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>📱</Text>
          <Text style={styles.featureText}>No need to remember passwords</Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        {capabilities?.hasHardware && capabilities?.isEnrolled ? (
          <TouchableOpacity
            style={styles.enableButton}
            onPress={handleEnableBiometrics}
            disabled={testing}
          >
            <Text style={styles.enableButtonText}>
              {testing ? 'Testing...' : 'Enable Biometric Authentication'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.disabledButton}
            disabled={true}
          >
            <Text style={styles.disabledButtonText}>
              Biometric Authentication Unavailable
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={testing}
        >
          <Text style={styles.skipButtonText}>Skip for Now</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          You can change this setting later in your profile.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  icon: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  featuresContainer: {
    marginBottom: 40,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 15,
    width: 30,
  },
  featureText: {
    fontSize: 16,
    color: '#555',
    flex: 1,
  },
  buttonContainer: {
    marginBottom: 30,
  },
  enableButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  enableButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  disabledButtonText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    backgroundColor: 'transparent',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  skipButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});