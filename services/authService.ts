import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  AuthError
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebaseConfig';
import { AppError, ErrorType } from '@/services/errorService';

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
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Create user profile in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      username: username,
      createdAt: new Date().toISOString(),
      profilePicture: null,
      isOnline: false,
    });

    return { success: true, user };
  } catch (error: any) {
    throw new AppError(
      ErrorType.AUTH,
      getAuthErrorMessage(error),
      error
    );
  }
};

export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    throw new AppError(
      ErrorType.AUTH,
      getAuthErrorMessage(error),
      error
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