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
  arrayUnion
} from 'firebase/firestore';
import { db } from '@/config/firebaseConfig';
import { Chat, ChatListItem, ChatParticipant } from '@/types/messageTypes';
import { Contact } from '@/services/contactService';
import { getUserProfile, UserProfile } from '@/services/userService';
import { AppError, ErrorType } from '@/services/errorService';

export class ChatService {
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
          lastActivity: new Date().toISOString(),
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
          lastActivity: new Date().toISOString(),
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
   * Get user's chat list with real-time updates
   */
  static listenToUserChats(
    userId: string,
    callback: (chats: ChatListItem[]) => void
  ): () => void {
    try {
      const userChatsRef = collection(db, 'users', userId, 'chats');
      const q = query(userChatsRef, orderBy('lastActivity', 'desc'));

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const chatPromises = snapshot.docs.map(async (chatDoc) => {
          const chatData = chatDoc.data();
          
          // Get full chat details
          const fullChatDoc = await getDoc(doc(db, 'chats', chatData.chatId));
          if (!fullChatDoc.exists()) return null;

          const fullChat = fullChatDoc.data() as Chat;
          
          const chatListItem: ChatListItem = {
            chat: {
              ...fullChat,
              id: fullChatDoc.id,
              // Convert timestamps - check if they exist and are Timestamps
              createdAt: (fullChat.createdAt && typeof fullChat.createdAt.toDate === 'function') 
                ? fullChat.createdAt.toDate().toISOString()
                : fullChat.createdAt || new Date().toISOString(),
              lastActivity: (fullChat.lastActivity && typeof fullChat.lastActivity.toDate === 'function') 
                ? fullChat.lastActivity.toDate().toISOString()
                : fullChat.lastActivity || new Date().toISOString(),
            },
            otherParticipant: chatData.otherParticipant,
            unreadCount: chatData.unreadCount || 0,
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
   * Update last message in chat
   */
  static async updateLastMessage(
    chatId: string,
    senderId: string,
    senderUsername: string,
    content: string,
    type: 'text' | 'image' | 'file' = 'text'
  ): Promise<void> {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await updateDoc(chatRef, {
        lastMessage: {
          content,
          senderId,
          senderUsername,
          timestamp: new Date().toISOString(),
          type,
        },
        lastActivity: serverTimestamp(),
      });
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
        createdAt: (chatData.createdAt && typeof chatData.createdAt.toDate === 'function') 
          ? chatData.createdAt.toDate().toISOString()
          : chatData.createdAt || new Date().toISOString(),
        lastActivity: (chatData.lastActivity && typeof chatData.lastActivity.toDate === 'function') 
          ? chatData.lastActivity.toDate().toISOString()
          : chatData.lastActivity || new Date().toISOString(),
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