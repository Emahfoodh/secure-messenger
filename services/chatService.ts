// services/chatService.ts

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/config/firebaseConfig';
import { Chat, ChatListItem, ChatParticipant } from '@/types/messageTypes';
import { Contact } from '@/services/contactService';
import { getUserProfile, UserProfile } from '@/services/userService';
import { AppError, ErrorType } from '@/services/errorService';

export class ChatService {
  /**
   * Helper method to safely convert Firestore timestamps to ISO strings
   */
  private static convertTimestamp(timestamp: any): string {
    if (!timestamp) {
      return new Date().toISOString();
    }
    
    // Check if it's a Firestore Timestamp object
    if (timestamp && typeof timestamp === 'object' && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toISOString();
    }
    
    // If it's already a string, return it
    if (typeof timestamp === 'string') {
      return timestamp;
    }
    
    // If it's a Date object
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    
    // Fallback to current date
    return new Date().toISOString();
  }

  /**
   * Create a new chat between users
   */
  static async createChat(
    currentUser: UserProfile,
    contact: Contact
  ): Promise<string> {
    try {
      // Create deterministic chat ID (always same order)
      const participants = [currentUser.uid, contact.uid].sort();
      const chatId = participants.join('_');

      // Check if chat already exists
      const existingChat = await getDoc(doc(db, 'chats', chatId));
      if (existingChat.exists()) {
        return chatId;
      }

      // Get contact's full profile
      const contactProfile = await getUserProfile(contact.uid);
      if (!contactProfile) {
        throw new AppError(ErrorType.VALIDATION, 'Contact profile not found');
      }

      const participantDetails: ChatParticipant[] = [
        {
          uid: currentUser.uid,
          username: currentUser.username,
          ...(currentUser.displayName && { displayName: currentUser.displayName }),
          ...(currentUser.profilePicture && { profilePicture: currentUser.profilePicture }),
          joinedAt: new Date().toISOString(),
        },
        {
          uid: contactProfile.uid,
          username: contactProfile.username,
          ...(contactProfile.displayName && { displayName: contactProfile.displayName }),
          ...(contactProfile.profilePicture && { profilePicture: contactProfile.profilePicture }),
          joinedAt: new Date().toISOString(),
        }
      ];

      const chat: Chat = {
        id: chatId,
        participants,
        participantDetails,
        lastActivity: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: currentUser.uid,
        unreadCount: {
          [currentUser.uid]: 0,
          [contact.uid]: 0,
        },
        isActive: true,
      };

      // Create chat document
      await setDoc(doc(db, 'chats', chatId), {
        ...chat,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      });

      // Add chat reference to both users
      await Promise.all([
        setDoc(doc(db, 'users', currentUser.uid, 'chats', chatId), {
          chatId,
          otherParticipant: {
            uid: contact.uid,
            username: contact.username,
            ...(contactProfile.displayName && { displayName: contactProfile.displayName }),
            ...(contactProfile.profilePicture && { profilePicture: contactProfile.profilePicture }),
          },
          lastActivity: serverTimestamp(),
          unreadCount: 0,
        }),
        setDoc(doc(db, 'users', contact.uid, 'chats', chatId), {
          chatId,
          otherParticipant: {
            uid: currentUser.uid,
            username: currentUser.username,
            ...(currentUser.displayName && { displayName: currentUser.displayName }),
            ...(currentUser.profilePicture && { profilePicture: currentUser.profilePicture }),
          },
          lastActivity: serverTimestamp(),
          unreadCount: 0,
        })
      ]);

      return chatId;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to create chat',
        error
      );
    }
  }

  /**
   * Get user's chat list with real-time updates - FIXED VERSION
   */
  static listenToUserChats(
    userId: string,
    callback: (chats: ChatListItem[]) => void
  ): () => void {
    try {
      // Listen to the main chats collection instead of user's subcollection
      // This ensures we get real-time updates when lastMessage changes
      const chatsRef = collection(db, 'chats');
      const q = query(
        chatsRef, 
        where('participants', 'array-contains', userId),
        orderBy('lastActivity', 'desc')
      );

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const chatPromises = snapshot.docs.map(async (chatDoc) => {
          const fullChat = chatDoc.data() as Chat;
          
          // Get the other participant details
          const otherParticipantUid = fullChat.participants.find(p => p !== userId);
          if (!otherParticipantUid) return null;

          const otherParticipant = fullChat.participantDetails.find(p => p.uid === otherParticipantUid);
          if (!otherParticipant) return null;

          // Get unread count from user's chat subcollection
          const userChatDoc = await getDoc(doc(db, 'users', userId, 'chats', chatDoc.id));
          const unreadCount = userChatDoc.exists() ? (userChatDoc.data().unreadCount || 0) : 0;

          const chatListItem: ChatListItem = {
            chat: {
              ...fullChat,
              id: chatDoc.id,
              // Convert timestamps properly - handle both Timestamp objects and strings
              createdAt: this.convertTimestamp(fullChat.createdAt),
              lastActivity: this.convertTimestamp(fullChat.lastActivity),
            },
            otherParticipant: {
              uid: otherParticipant.uid,
              username: otherParticipant.username,
              displayName: otherParticipant.displayName,
              profilePicture: otherParticipant.profilePicture,
            },
            unreadCount,
            lastMessage: fullChat.lastMessage ? {
              content: fullChat.lastMessage.content,
              senderId: fullChat.lastMessage.senderId,
              senderUsername: fullChat.lastMessage.senderUsername,
              timestamp: fullChat.lastMessage.timestamp,
              isOwnMessage: fullChat.lastMessage.senderId === userId,
            } : undefined,
          };

          return chatListItem;
        });

        const chats = (await Promise.all(chatPromises)).filter(Boolean) as ChatListItem[];
        callback(chats);
      }, (error) => {
        console.error('Error listening to chats:', error);
        throw new AppError(
          ErrorType.STORAGE,
          'Failed to load chats',
          error
        );
      });

      return unsubscribe;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to set up chat listener',
        error
      );
    }
  }

  /**
   * Update last message in chat - IMPROVED VERSION
   */
  static async updateLastMessage(
    chatId: string,
    senderId: string,
    senderUsername: string,
    content: string,
    type: 'text' | 'image' | 'file' = 'text'
  ): Promise<void> {
    try {
      // Use a batch to ensure atomicity
      const batch = writeBatch(db);
      
      const chatRef = doc(db, 'chats', chatId);
      
      // Update the main chat document
      batch.update(chatRef, {
        lastMessage: {
          content,
          senderId,
          senderUsername,
          timestamp: new Date().toISOString(),
          type,
        },
        lastActivity: serverTimestamp(),
      });

      // Also update both users' chat subcollections for immediate local updates
      const chatDoc = await getDoc(chatRef);
      if (chatDoc.exists()) {
        const chatData = chatDoc.data() as Chat;
        
        for (const participantId of chatData.participants) {
          const userChatRef = doc(db, 'users', participantId, 'chats', chatId);
          batch.update(userChatRef, {
            lastActivity: serverTimestamp(),
          });
        }
      }

      await batch.commit();
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update last message',
        error
      );
    }
  }

  /**
   * Increment unread count for a user
   */
  static async incrementUnreadCount(chatId: string, userId: string): Promise<void> {
    try {
      const userChatRef = doc(db, 'users', userId, 'chats', chatId);
      const userChatDoc = await getDoc(userChatRef);
      
      if (userChatDoc.exists()) {
        const currentUnread = userChatDoc.data().unreadCount || 0;
        await updateDoc(userChatRef, {
          unreadCount: currentUnread + 1,
        });
      }
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update unread count',
        error
      );
    }
  }

  /**
   * Mark chat as read (reset unread count)
   */
  static async markChatAsRead(chatId: string, userId: string): Promise<void> {
    try {
      const userChatRef = doc(db, 'users', userId, 'chats', chatId);
      await updateDoc(userChatRef, {
        unreadCount: 0,
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to mark chat as read',
        error
      );
    }
  }

  /**
   * Get a specific chat by ID
   */
  static async getChatById(chatId: string): Promise<Chat | null> {
    try {
      const chatDoc = await getDoc(doc(db, 'chats', chatId));
      if (!chatDoc.exists()) return null;

      const chatData = chatDoc.data();
      return {
        ...chatData,
        id: chatDoc.id,
        createdAt: this.convertTimestamp(chatData.createdAt),
        lastActivity: this.convertTimestamp(chatData.lastActivity),
      } as Chat;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get chat',
        error
      );
    }
  }
}