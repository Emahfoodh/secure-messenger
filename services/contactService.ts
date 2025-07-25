import { db } from '@/config/firebaseConfig';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { UserProfile } from './userService';
import { AppError, ErrorType } from '@/services/errorService';

export interface Contact {
  uid: string;
  username: string;
  displayName?: string;
  profilePicture?: string;
  addedAt: string;
}

export interface ContactRequest {
  id: string; // document ID
  fromUid: string;
  fromUsername: string;
  fromDisplayName?: string;
  fromProfilePicture?: string;
  toUid: string;
  toUsername: string;
  status: 'pending' | 'accepted' | 'declined';
  sentAt: string;
  respondedAt?: string;
}

// Helper function to remove undefined values from an object
const removeUndefinedFields = (obj: any): any => {
  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined && obj[key] !== null) {
      cleaned[key] = obj[key];
    }
  });
  return cleaned;
};

// Send a contact request
export const sendContactRequest = async (
  fromUser: UserProfile, 
  toUser: UserProfile
): Promise<void> => {
  try {
    const requestId = `${fromUser.uid}_${toUser.uid}`;
    
    const requestData = {
      fromUid: fromUser.uid,
      fromUsername: fromUser.username,
      fromDisplayName: fromUser.displayName,
      fromProfilePicture: fromUser.profilePicture,
      toUid: toUser.uid,
      toUsername: toUser.username,
      status: 'pending' as const,
      sentAt: new Date().toISOString(),
    };

    // Remove undefined fields before saving
    const cleanedData = removeUndefinedFields(requestData);

    await setDoc(doc(db, 'contactRequests', requestId), cleanedData);
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to send contact request',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

// Get incoming contact requests (requests sent TO current user)
export const getIncomingRequests = async (userUid: string): Promise<ContactRequest[]> => {
  try {
    const q = query(
      collection(db, 'contactRequests'),
      where('toUid', '==', userUid),
      where('status', '==', 'pending')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ContactRequest));
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to load incoming requests',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

// Get outgoing contact requests (requests sent FROM current user)
export const getOutgoingRequests = async (userUid: string): Promise<ContactRequest[]> => {
  try {
    const q = query(
      collection(db, 'contactRequests'),
      where('fromUid', '==', userUid),
      where('status', '==', 'pending')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as ContactRequest));
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to load outgoing requests',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

// Check if there's already a pending request between two users
export const checkExistingRequest = async (
  fromUid: string, 
  toUid: string
): Promise<ContactRequest | null> => {
  try {
    // Check both directions
    const requestId1 = `${fromUid}_${toUid}`;
    const requestId2 = `${toUid}_${fromUid}`;
    
    const [doc1, doc2] = await Promise.all([
      getDoc(doc(db, 'contactRequests', requestId1)),
      getDoc(doc(db, 'contactRequests', requestId2))
    ]);
    
    if (doc1.exists()) {
      return { id: doc1.id, ...doc1.data() } as ContactRequest;
    }
    
    if (doc2.exists()) {
      return { id: doc2.id, ...doc2.data() } as ContactRequest;
    }
    
    return null;
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to check existing request',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

// Accept a contact request
export const acceptContactRequest = async (request: ContactRequest): Promise<void> => {
  try {
    // Add both users as contacts to each other
    const fromUserDoc = await getDoc(doc(db, 'users', request.fromUid));
    const toUserDoc = await getDoc(doc(db, 'users', request.toUid));
    
    if (!fromUserDoc.exists() || !toUserDoc.exists()) {
      throw new AppError(
        ErrorType.STORAGE,
        'User information not found'
      );
    }
    
    const fromUserData = fromUserDoc.data() as UserProfile;
    const toUserData = toUserDoc.data() as UserProfile;
    
    // Add to fromUser's contacts
    const contactDataForFrom: Contact = {
      uid: toUserData.uid,
      username: toUserData.username,
      addedAt: new Date().toISOString(),
    };
    
    // Add to toUser's contacts
    const contactDataForTo: Contact = {
      uid: fromUserData.uid,
      username: fromUserData.username,
      addedAt: new Date().toISOString(),
    };
    
    // Execute all operations
    await Promise.all([
      setDoc(doc(db, 'users', request.fromUid, 'contacts', request.toUid), contactDataForFrom),
      setDoc(doc(db, 'users', request.toUid, 'contacts', request.fromUid), contactDataForTo),
      updateDoc(doc(db, 'contactRequests', request.id), {
        status: 'accepted',
        respondedAt: new Date().toISOString()
      })
    ]);
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to accept contact request',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

// Decline a contact request
export const declineContactRequest = async (requestId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'contactRequests', requestId));
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to decline contact request',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

// Cancel an outgoing contact request
export const cancelContactRequest = async (requestId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'contactRequests', requestId));
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to cancel contact request',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

export const removeContact = async (currentUserUid: string, contactUid: string): Promise<void> => {
  try {
    // Generate both possible request IDs (bidirectional)
    const requestId1 = `${currentUserUid}_${contactUid}`;
    const requestId2 = `${contactUid}_${currentUserUid}`;
    
    // Remove from current user's contacts
    await deleteDoc(doc(db, 'users', currentUserUid, 'contacts', contactUid));
    
    // Remove current user from the contact's contacts list
    await deleteDoc(doc(db, 'users', contactUid, 'contacts', currentUserUid));
    
    // Remove any existing contact requests between them (both directions)
    const deletePromises = [];
    
    // Check and delete first direction request
    try {
      const requestDoc1 = await getDoc(doc(db, 'contactRequests', requestId1));
      if (requestDoc1.exists()) {
        deletePromises.push(deleteDoc(doc(db, 'contactRequests', requestId1)));
      }
    } catch (error) {
      console.log('No request found for', requestId1);
    }
    
    // Check and delete second direction request
    try {
      const requestDoc2 = await getDoc(doc(db, 'contactRequests', requestId2));
      if (requestDoc2.exists()) {
        deletePromises.push(deleteDoc(doc(db, 'contactRequests', requestId2)));
      }
    } catch (error) {
      console.log('No request found for', requestId2);
    }
    
    // Execute all delete operations
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to remove contact',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

export const getContacts = async (userUid: string): Promise<Contact[]> => {
  try {
    const contactsRef = collection(db, 'users', userUid, 'contacts');
    const querySnapshot = await getDocs(contactsRef);
    
    return querySnapshot.docs.map(doc => doc.data() as Contact);
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to load contacts',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};

export const isContact = async (currentUserUid: string, targetUserUid: string): Promise<boolean> => {
  try {
    const contactDoc = await getDoc(doc(db, 'users', currentUserUid, 'contacts', targetUserUid));
    return contactDoc.exists();
  } catch (error: any) {
    throw new AppError(
      ErrorType.STORAGE,
      'Failed to check contact status',
      error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
    );
  }
};