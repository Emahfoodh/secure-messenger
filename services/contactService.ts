import { db } from '@/config/firebaseConfig';
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    setDoc
} from 'firebase/firestore';
import { UserProfile } from './userService';

export interface Contact {
  uid: string;
  username: string;
  displayName?: string;
  profilePicture?: string;
  addedAt: string;
}

export const addContact = async (currentUserUid: string, contactProfile: UserProfile): Promise<boolean> => {
  try {
    // Add to current user's contacts
    const contactData: Contact = {
      uid: contactProfile.uid,
      username: contactProfile.username,
      addedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'users', currentUserUid, 'contacts', contactProfile.uid), contactData);
    
    // Add current user to the contact's contacts list (mutual contact)
    const currentUserDoc = await getDoc(doc(db, 'users', currentUserUid));
    if (currentUserDoc.exists()) {
      const currentUserData = currentUserDoc.data() as UserProfile;
      const reverseContactData: Contact = {
        uid: currentUserData.uid,
        username: currentUserData.username,
        addedAt: new Date().toISOString(),
      };
      
      await setDoc(doc(db, 'users', contactProfile.uid, 'contacts', currentUserUid), reverseContactData);
    }
    
    return true;
  } catch (error) {
    console.error('Error adding contact:', error);
    return false;
  }
};

export const removeContact = async (currentUserUid: string, contactUid: string): Promise<boolean> => {
  try {
    // Remove from current user's contacts
    await deleteDoc(doc(db, 'users', currentUserUid, 'contacts', contactUid));
    
    // Remove current user from the contact's contacts list
    await deleteDoc(doc(db, 'users', contactUid, 'contacts', currentUserUid));
    
    return true;
  } catch (error) {
    console.error('Error removing contact:', error);
    return false;
  }
};

export const getContacts = async (userUid: string): Promise<Contact[]> => {
  try {
    const contactsRef = collection(db, 'users', userUid, 'contacts');
    const querySnapshot = await getDocs(contactsRef);
    
    return querySnapshot.docs.map(doc => doc.data() as Contact);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return [];
  }
};

export const isContact = async (currentUserUid: string, targetUserUid: string): Promise<boolean> => {
  try {
    const contactDoc = await getDoc(doc(db, 'users', currentUserUid, 'contacts', targetUserUid));
    return contactDoc.exists();
  } catch (error) {
    console.error('Error checking contact status:', error);
    return false;
  }
};