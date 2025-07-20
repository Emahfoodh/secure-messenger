// services/chatService.ts

import { db } from '@/config/firebaseConfig';
import { Contact } from '@/services/contactService';
import { EncryptionService } from '@/services/encryptionService'; // 🔐 NEW
import { AppError, ErrorType } from '@/services/errorService';
import { KeyManagementService } from '@/services/keyManagementService'; // 🔐 NEW
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
        // Generate random session key
        const sessionKey = KeyManagementService.generateSessionKey();
        
        // Get recipient's public key
        if (!contactProfile.publicKey) {
          throw new AppError(
            ErrorType.ENCRYPTION,
            'Recipient does not support encrypted chats'
          );
        }

        // Encrypt session key for both participants
        sessionKeys = {
          [currentUser.uid]: await KeyManagementService.encryptSessionKey(
            sessionKey,
            currentUser.publicKey!
          ),
          [contact.uid]: await KeyManagementService.encryptSessionKey(
            sessionKey,
            contactProfile.publicKey
          )
        };
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
          const userChatDoc = await getDoc(doc(db, 'users', userId, 'chats', chatDoc.id));
          const unreadCount = userChatDoc.exists() ? (userChatDoc.data().unreadCount || 0) : 0;

          // 🔐 Decrypt last message if it's encrypted
          let lastMessageContent = fullChat.lastMessage?.content;
          if (fullChat.lastMessage?.isEncrypted && lastMessageContent) {
            try {
              const chatKey = await EncryptionService.generateChatKey(
                fullChat.participants[0], 
                fullChat.participants[1]
              );
              lastMessageContent = await EncryptionService.decryptMessage(lastMessageContent, chatKey);
            } catch (error) {
              console.error('Failed to decrypt last message preview:', error);
              lastMessageContent = '🔒 Encrypted message';
            }
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
   * Update last message in chat - UPDATED WITH ENCRYPTION SUPPORT
   */
  static async updateLastMessage(
    chatId: string,
    senderId: string,
    senderUsername: string,
    content: string,
    type: 'text' | 'image' | 'video' | 'file' = 'text',
    isEncrypted: boolean = false // 🔐 Track if message is encrypted
  ): Promise<void> {
    try {
      // Use a batch to ensure atomicity
      const batch = writeBatch(db);
      
      const chatRef = doc(db, 'chats', chatId);
      
      // 🔐 For encrypted messages, store encrypted content in lastMessage
      let lastMessageContent = content;
      if (isEncrypted) {
        // Get chat info to determine encryption key
        const chatDoc = await getDoc(chatRef);
        if (chatDoc.exists()) {
          const chatData = chatDoc.data() as Chat;
          if (chatData.encryptionEnabled) {
            try {
              const chatKey = await EncryptionService.generateChatKey(
                chatData.participants[0], 
                chatData.participants[1]
              );
              lastMessageContent = await EncryptionService.encryptMessage(content, chatKey);
            } catch (error) {
              console.error('Failed to encrypt last message:', error);
              // Fall back to unencrypted if encryption fails
              lastMessageContent = content;
              isEncrypted = false;
            }
          }
        }
      }
      
      // Update the main chat document
      batch.update(chatRef, {
        lastMessage: {
          content: lastMessageContent, // 🔐 May be encrypted
          senderId,
          senderUsername,
          timestamp: new Date().toISOString(),
          type,
          isEncrypted, // 🔐 Track encryption status
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
      const userChatRef = doc(db, 'users', userId, 'chats', chatId);
      const userChatDoc = await getDoc(userChatRef);
      
      if (userChatDoc.exists()) {
        const currentUnread = userChatDoc.data().unreadCount || 0;
        await updateDoc(userChatRef, {
          unreadCount: currentUnread + 1,
        });
      }
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
    try {
      const userChatRef = doc(db, 'users', userId, 'chats', chatId);
      await updateDoc(userChatRef, {
        unreadCount: 0,
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