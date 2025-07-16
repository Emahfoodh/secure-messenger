import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/config/firebaseConfig';
import { BiometricService } from '@/services/biometricService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  biometricAuthenticated: boolean;
  biometricEnabled: boolean;
  biometricSetupCompleted: boolean;
  logout: () => Promise<void>;
  authenticateWithBiometrics: () => Promise<boolean>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  checkBiometricStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [biometricAuthenticated, setBiometricAuthenticated] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricSetupCompleted, setBiometricSetupCompletedState] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      if (user) {
        await checkBiometricStatus();
      } else {
        // Reset biometric states when user logs out
        setBiometricAuthenticated(false);
        setBiometricEnabledState(false);
        setBiometricSetupCompletedState(false);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const checkBiometricStatus = async () => {
    try {
      const enabled = await BiometricService.isBiometricEnabled();
      const setupCompleted = await BiometricService.isBiometricSetupCompleted();
      
      setBiometricEnabledState(enabled);
      setBiometricSetupCompletedState(setupCompleted);
      
      // If biometric is enabled but user hasn't authenticated yet, reset the authenticated state
      if (enabled && biometricAuthenticated) {
        // Keep the authenticated state if already authenticated
      } else if (enabled) {
        setBiometricAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking biometric status:', error);
    }
  };

  const authenticateWithBiometrics = async (): Promise<boolean> => {
    try {
      const result = await BiometricService.authenticateAsync({
        promptMessage: 'Authenticate to access your secure messages',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        setBiometricAuthenticated(true);
        return true;
      } else {
        setBiometricAuthenticated(false);
        return false;
      }
    } catch (error) {
      console.error('Biometric authentication error:', error);
      setBiometricAuthenticated(false);
      return false;
    }
  };

  const setBiometricEnabled = async (enabled: boolean) => {
    try {
      await BiometricService.setBiometricEnabled(enabled);
      setBiometricEnabledState(enabled);
      
      if (!enabled) {
        setBiometricAuthenticated(false);
      }
    } catch (error) {
      console.error('Error setting biometric enabled status:', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      // Reset all biometric states
      setBiometricAuthenticated(false);
      setBiometricEnabledState(false);
      setBiometricSetupCompletedState(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        loading, 
        biometricAuthenticated,
        biometricEnabled,
        biometricSetupCompleted,
        logout,
        authenticateWithBiometrics,
        setBiometricEnabled,
        checkBiometricStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};