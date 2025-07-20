import { db, storage } from '@/config/firebaseConfig';
import { AppError, ErrorType } from '@/services/errorService';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName?: string;
  profilePicture?: string;
  bio?: string;
  createdAt: string;
  isOnline: boolean;
  lastSeen?: string;
  publicKey?: string; // Public key for E2EE
}

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to load user profile',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>): Promise<void> => {
  try {
    await updateDoc(doc(db, 'users', uid), updates);
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to update user profile',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

export const uploadProfilePicture = async (uid: string, imageUri: string): Promise<string> => {
  try {
    const response = await fetch(imageUri);
    if (!response.ok) {
      throw new AppError(
        ErrorType.NETWORK,
        'Failed to load image for upload'
      );
    }
    
    const blob = await response.blob();
    
    const imageRef = ref(storage, `profile-pictures/${uid}`);
    await uploadBytes(imageRef, blob);
    
    const downloadURL = await getDownloadURL(imageRef);
    return downloadURL;
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to upload profile picture',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

export const searchUsersByUsername = async (searchTerm: string): Promise<UserProfile[]> => {
  try {
    const q = query(
      collection(db, 'users'),
      where('username', '>=', searchTerm),
      where('username', '<=', searchTerm + '\uf8ff')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UserProfile);
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to search users',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};