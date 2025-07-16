import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BiometricCapabilities {
  hasHardware: boolean;
  isEnrolled: boolean;
  availableTypes: LocalAuthentication.AuthenticationType[];
}

export interface BiometricResult {
  success: boolean;
  error?: string;
  biometricType?: string;
}

export class BiometricService {
  private static BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
  private static BIOMETRIC_SETUP_COMPLETED_KEY = 'biometric_setup_completed';

  /**
   * Check if device supports biometric authentication
   */
  static async checkBiometricCapabilities(): Promise<BiometricCapabilities> {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const availableTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      return {
        hasHardware,
        isEnrolled,
        availableTypes,
      };
    } catch (error) {
      console.error('Error checking biometric capabilities:', error);
      return {
        hasHardware: false,
        isEnrolled: false,
        availableTypes: [],
      };
    }
  }

  /**
   * Get human-readable biometric types
   */
  static getBiometricTypeNames(types: LocalAuthentication.AuthenticationType[]): string[] {
    const typeNames: string[] = [];
    
    types.forEach(type => {
      switch (type) {
        case LocalAuthentication.AuthenticationType.FINGERPRINT:
          typeNames.push('Fingerprint');
          break;
        case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
          typeNames.push('Face ID');
          break;
        case LocalAuthentication.AuthenticationType.IRIS:
          typeNames.push('Iris');
          break;
      }
    });

    return typeNames;
  }

  /**
   * Authenticate user with biometrics
   */
  static async authenticateAsync(options: {
    promptMessage?: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    requireConfirmation?: boolean;
  } = {}): Promise<BiometricResult> {
    try {
      const capabilities = await this.checkBiometricCapabilities();
      
      if (!capabilities.hasHardware) {
        return {
          success: false,
          error: 'Biometric hardware not available on this device',
        };
      }

      if (!capabilities.isEnrolled) {
        return {
          success: false,
          error: 'No biometric credentials enrolled. Please set up biometrics in your device settings.',
        };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: options.promptMessage || 'Authenticate to access your secure messages',
        cancelLabel: options.cancelLabel || 'Cancel',
        fallbackLabel: options.fallbackLabel || 'Use Passcode',
        requireConfirmation: options.requireConfirmation ?? false,
      });

      if (result.success) {
        const biometricTypes = this.getBiometricTypeNames(capabilities.availableTypes);
        return {
          success: true,
          biometricType: biometricTypes.join(', '),
        };
      } else {
        let errorMessage = 'Authentication failed';
        
        if (result.error) {
          switch (result.error) {
            case 'user_cancel':
              errorMessage = 'Authentication cancelled by user';
              break;
            case 'system_cancel':
              errorMessage = 'Authentication cancelled by system';
              break;
            case 'not_available':
              errorMessage = 'Biometric authentication not available';
              break;
            case 'not_enrolled':
              errorMessage = 'No biometric credentials enrolled';
              break;
            case 'lockout':
              errorMessage = 'Too many failed attempts. Try again later.';
              break;
            case 'authentication_failed':
              errorMessage = 'Authentication failed. Please try again.';
              break;
            case 'user_fallback':
              errorMessage = 'User selected fallback authentication';
              break;
            default:
              errorMessage = `Authentication failed: ${result.error}`;
          }
        }

        return {
          success: false,
          error: errorMessage,
        };
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred during authentication',
      };
    }
  }

  /**
   * Check if biometric authentication is enabled for the app
   */
  static async isBiometricEnabled(): Promise<boolean> {
    try {
      const enabled = await AsyncStorage.getItem(this.BIOMETRIC_ENABLED_KEY);
      return enabled === 'true';
    } catch (error) {
      console.error('Error checking biometric enabled status:', error);
      return false;
    }
  }

  /**
   * Enable/disable biometric authentication for the app
   */
  static async setBiometricEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(this.BIOMETRIC_ENABLED_KEY, enabled.toString());
    } catch (error) {
      console.error('Error setting biometric enabled status:', error);
    }
  }

  /**
   * Check if biometric setup has been completed
   */
  static async isBiometricSetupCompleted(): Promise<boolean> {
    try {
      const completed = await AsyncStorage.getItem(this.BIOMETRIC_SETUP_COMPLETED_KEY);
      return completed === 'true';
    } catch (error) {
      console.error('Error checking biometric setup status:', error);
      return false;
    }
  }

  /**
   * Mark biometric setup as completed
   */
  static async setBiometricSetupCompleted(completed: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(this.BIOMETRIC_SETUP_COMPLETED_KEY, completed.toString());
    } catch (error) {
      console.error('Error setting biometric setup status:', error);
    }
  }

  /**
   * Get a user-friendly description of available biometric methods
   */
  static async getBiometricDescription(): Promise<string> {
    const capabilities = await this.checkBiometricCapabilities();
    
    if (!capabilities.hasHardware) {
      return 'Biometric authentication not available on this device';
    }

    if (!capabilities.isEnrolled) {
      return 'No biometric credentials enrolled. Please set up biometrics in your device settings.';
    }

    const types = this.getBiometricTypeNames(capabilities.availableTypes);
    if (types.length === 0) {
      return 'Biometric authentication available';
    }

    return `${types.join(' and ')} available`;
  }
}