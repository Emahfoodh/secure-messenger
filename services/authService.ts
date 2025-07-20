import { auth, db } from '@/config/firebaseConfig';
import { AppError, ErrorType } from '@/services/errorService';
import { KeyManagementService } from '@/services/keyManagementService';
import {
  AuthError,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export interface AuthResult {
  success: boolean;
  user?: any;
}

export const signUp = async (
  email: string, 
  password: string, 
  username: string
): Promise<AuthResult> => {
  try {
    // Create Firebase auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Generate encryption keys for E2EE
    const { publicKey } = await KeyManagementService.generateUserKeyPair();
    
    // Create user profile in Firestore with public key
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      username: username,
      createdAt: new Date().toISOString(),
      profilePicture: null,
      isOnline: false,
      publicKey, // Store public key in profile
    });

    return { success: true, user };
  } catch (error: any) {
    throw new AppError(
      ErrorType.AUTH,
      getAuthErrorMessage(error),
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Verify private key exists
    await KeyManagementService.verifyPrivateKeyExists();
    
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    throw new AppError(
      ErrorType.AUTH,
      getAuthErrorMessage(error),
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

const getAuthErrorMessage = (error: AuthError): string => {
  switch (error.code) {
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection';
    case 'auth/invalid-credential':
      return 'Invalid email or password';
    default:
      return 'Authentication failed. Please try again';
  }
};