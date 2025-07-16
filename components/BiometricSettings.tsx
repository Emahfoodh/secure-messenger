import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { BiometricService } from '@/services/biometricService';
import { ErrorService } from '@/services/errorService';

export default function BiometricSettings() {
  const { biometricEnabled, setBiometricEnabled, authenticateWithBiometrics } = useAuth();
  const [loading, setLoading] = useState(false);
  const [biometricDescription, setBiometricDescription] = useState('');

  useEffect(() => {
    loadBiometricDescription();
  }, []);

  const loadBiometricDescription = async () => {
    try {
      const description = await BiometricService.getBiometricDescription();
      setBiometricDescription(description);
    } catch (error) {
      ErrorService.handleError(error, 'Biometric Settings');
      setBiometricDescription('Unable to check biometric capabilities');
    }
  };

  const handleToggleBiometric = async (enabled: boolean) => {
    if (enabled) {
      // Test biometric authentication before enabling
      setLoading(true);
      try {
        const success = await authenticateWithBiometrics();

        if (success) {
          await setBiometricEnabled(true);
          Alert.alert('Success', 'Biometric authentication has been enabled.');
        } else {
          Alert.alert('Failed', 'Biometric authentication test failed.');
        }
      } catch (error) {
        ErrorService.handleError(error, 'Biometric Settings');
      } finally {
        setLoading(false);
      }
    } else {
      // Disable biometric authentication
      Alert.alert(
        'Disable Biometric Authentication',
        'Are you sure you want to disable biometric authentication?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: async () => {
              try {
                await setBiometricEnabled(false);
                Alert.alert('Disabled', 'Biometric authentication has been disabled.');
              } catch (error) {
                ErrorService.handleError(error, 'Biometric Settings');
              }
            },
          },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Security Settings</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingLabel}>Biometric Authentication</Text>
          <Text style={styles.settingDescription}>{biometricDescription}</Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={handleToggleBiometric}
          disabled={loading}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
          thumbColor={biometricEnabled ? '#007AFF' : '#f4f3f4'}
        />
      </View>

      <Text style={styles.helpText}>
        When enabled, you'll need to authenticate with biometrics each time you open the app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  helpText: {
    fontSize: 12,
    color: '#999',
    marginTop: 10,
    lineHeight: 16,
  },
});