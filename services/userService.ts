import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/config/firebaseConfig';

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
}

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>): Promise<boolean> => {
  try {
    await updateDoc(doc(db, 'users', uid), updates);
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
};

export const uploadProfilePicture = async (uid: string, imageUri: string): Promise<string | null> => {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    const imageRef = ref(storage, `profile-pictures/${uid}`);
    await uploadBytes(imageRef, blob);
    
    const downloadURL = await getDownloadURL(imageRef);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    return null;
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
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
};