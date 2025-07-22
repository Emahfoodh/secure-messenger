// services/chatService.ts

import { db } from '@/config/firebaseConfig';
import { Contact } from '@/services/contactService';
import { AppError, ErrorType } from '@/services/errorService';
import { getUserProfile, UserProfile } from '@/services/userService';
import { Chat, ChatListItem, ChatParticipant } from '@/types/messageTypes';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';

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
   * 🔐 Now supports creating secret chats with encryption
   */
  static async createChat(
    currentUser: UserProfile,
    contact: Contact,
    isSecretChat: boolean = false // 🔐 Flag for secret chat
  ): Promise<string> {
    try {
      // Create deterministic chat ID (always same order)
      const participants = [currentUser.uid, contact.uid].sort();
      let chatId = participants.join('_');
      
      // 🔐 For secret chats, add prefix to differentiate
      if (isSecretChat) {
        chatId = `secret_${chatId}`;
      }

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

      // 🔐 For secret chats, generate and encrypt session key
      let sessionKeys: { [key: string]: string } | undefined;
      if (isSecretChat) {
        console.warn("🔐 encryption and decryption will be implemented later");
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
        // 🔐 Encryption settings
        isSecretChat,
        encryptionEnabled: isSecretChat,
        ...(sessionKeys && { sessionKeys }), // Add session keys if it's a secret chat
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
          isSecretChat, // 🔐 Track if this is a secret chat
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
          isSecretChat, // 🔐 Track if this is a secret chat
        })
      ]);

      return chatId;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to create chat',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * 🔐 Create a secret chat specifically
   */
  static async createSecretChat(
    currentUser: UserProfile,
    contact: Contact
  ): Promise<string> {
    return this.createChat(currentUser, contact, true);
  }

  /**
   * Get user's chat list with real-time updates - UPDATED WITH ENCRYPTION SUPPORT
   */
  static listenToUserChats(
    userId: string,
    callback: (chats: ChatListItem[]) => void
  ): () => void {
    try {
      // Listen to the main chats collection
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
          const unreadCount = fullChat.unreadCount?.[userId] || 0;

          // 🔐 Decrypt last message if it's encrypted
          let lastMessageContent = fullChat.lastMessage?.content;
          if (fullChat.lastMessage?.isEncrypted && lastMessageContent) {
            console.warn("🔐 encryption and decryption will be implemented later");
          }

          const chatListItem: ChatListItem = {
            chat: {
              ...fullChat,
              id: chatDoc.id,
              // Convert timestamps properly
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
              content: lastMessageContent || 'No content', // 🔐 Use decrypted content
              senderId: fullChat.lastMessage.senderId,
              senderUsername: fullChat.lastMessage.senderUsername,
              timestamp: fullChat.lastMessage.timestamp,
              isOwnMessage: fullChat.lastMessage.senderId === userId,
              isEncrypted: fullChat.lastMessage.isEncrypted, // 🔐 Show encryption status
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
          error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
        );
      });

      return unsubscribe;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to set up chat listener',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Update last message in chat
   */
  static async updateLastMessage(
    chatId: string,
    senderId: string,
    senderUsername: string,
    content?: string,
    type: 'text' | 'image' | 'video' | 'file' = 'text',
    isEncrypted = false
  ): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);

      const lastMessage = {
        content,
        senderId,
        senderUsername,
        timestamp: new Date().toISOString(),
        type,
        isEncrypted,
      };

      if (isEncrypted) {
        console.warn("🔐 encryption and decryption will be implemented later");
      }

      await updateDoc(chatRef, {
        lastMessage,
        lastActivity: serverTimestamp(),
      });
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update last message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Increment unread count for a user
   */
  static async incrementUnreadCount(chatId: string, userId: string): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);
      const userChatDoc = await getDoc(chatRef);

      // console.log('chat doc:', JSON.stringify(userChatDoc.data(), null, 2));
      // Print the unreadCount object directly
      const unreadCount = userChatDoc.data()?.unreadCount || {};
      const newCount = (unreadCount[userId] || 0) + 1;
      unreadCount[userId] = newCount;

      await updateDoc(chatRef, {
        unreadCount,
      });
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update unread count',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Mark chat as read (reset unread count)
   */
  static async markChatAsRead(chatId: string, userId: string): Promise<void> {
    console.log('Marking chat as read:', chatId, 'for user:', userId);
    try {
      const chatRef = doc(db, 'chats', chatId);
      const userChatDoc = await getDoc(chatRef);
      console.log('Marking chat as read:', chatId, 'for user:', userId);
      const unreadCount = userChatDoc.data()?.unreadCount || {};
      unreadCount[userId] = 0;

      await updateDoc(chatRef, {
        unreadCount,
      });
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to mark chat as read',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
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
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get chat',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * 🔐 Check if a chat is a secret chat
   */
  static async isSecretChat(chatId: string): Promise<boolean> {
    try {
      const chat = await this.getChatById(chatId);
      return chat?.isSecretChat || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 🔐 Enable/disable encryption for a chat
   */
  static async toggleChatEncryption(chatId: string, enabled: boolean): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        encryptionEnabled: enabled,
      });
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to toggle chat encryption',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }
}