// services/messageService.ts

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  getDoc,
  getDocs,
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebaseConfig';
import { Message, SendMessageData } from '@/types/messageTypes';
import { AppError, ErrorType } from '@/services/errorService';
import { getUserProfile } from '@/services/userService';

export class MessageService {
  /**
   * Send a new message to a chat
   */
  static async sendMessage(
    chatId: string, 
    senderId: string, 
    messageData: SendMessageData
  ): Promise<string> {
    try {
      // Get sender profile for message metadata
      const senderProfile = await getUserProfile(senderId);
      if (!senderProfile) {
        throw new AppError(ErrorType.VALIDATION, 'Sender profile not found');
      }

      const message: Omit<Message, 'id'> = {
        chatId,
        senderId,
        senderUsername: senderProfile.username,
        ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
        ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
        content: messageData.content,
        type: messageData.type,
        timestamp: new Date().toISOString(),
        status: 'sending',
        ...(messageData.replyTo && { replyTo: messageData.replyTo }),
      };

      // Add message to Firestore
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const docRef = await addDoc(messagesRef, {
        ...message,
        timestamp: serverTimestamp(), // Use server timestamp for consistency
      });

      // Update message status to sent
      await updateDoc(docRef, { status: 'sent' });

      return docRef.id;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send message',
        error
      );
    }
  }

  /**
   * Listen to messages in a chat (real-time)
   */
  static listenToMessages(
    chatId: string,
    callback: (messages: Message[]) => void,
    messageLimit: number = 50
  ): () => void {
    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const q = query(
        messagesRef,
        orderBy('timestamp', 'desc'),
        limit(messageLimit)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const messages: Message[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Convert Firestore timestamp to ISO string
            timestamp: data.timestamp instanceof Timestamp 
              ? data.timestamp.toDate().toISOString()
              : data.timestamp,
          } as Message;
        }).reverse(); // Reverse to show oldest first

        callback(messages);
      }, (error) => {
        console.error('Error listening to messages:', error);
        throw new AppError(
          ErrorType.STORAGE,
          'Failed to load messages',
          error
        );
      });

      return unsubscribe;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to set up message listener',
        error
      );
    }
  }

  /**
   * Load older messages (pagination)
   */
  static async loadOlderMessages(
    chatId: string,
    beforeTimestamp: string,
    messageLimit: number = 20
  ): Promise<Message[]> {
    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const q = query(
        messagesRef,
        orderBy('timestamp', 'desc'),
        where('timestamp', '<', new Date(beforeTimestamp)),
        limit(messageLimit)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp instanceof Timestamp 
            ? data.timestamp.toDate().toISOString()
            : data.timestamp,
        } as Message;
      }).reverse();
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to load older messages',
        error
      );
    }
  }

  /**
   * Mark messages as read
   */
  static async markMessagesAsRead(
    chatId: string, 
    userId: string, 
    messageIds: string[]
  ): Promise<void> {
    try {
      const updatePromises = messageIds.map(messageId => {
        const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
        return updateDoc(messageRef, { status: 'read' });
      });

      await Promise.all(updatePromises);
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to mark messages as read',
        error
      );
    }
  }

  /**
   * Delete a message
   */
  static async deleteMessage(chatId: string, messageId: string): Promise<void> {
    try {
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, {
        content: 'This message was deleted',
        type: 'deleted',
        editedAt: new Date().toISOString()
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to delete message',
        error
      );
    }
  }

  /**
   * Edit a message
   */
  static async editMessage(
    chatId: string, 
    messageId: string, 
    newContent: string
  ): Promise<void> {
    try {
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, {
        content: newContent,
        editedAt: new Date().toISOString()
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to edit message',
        error
      );
    }
  }
}