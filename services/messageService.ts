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
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/config/firebaseConfig';
import { Message, SendMessageData } from '@/types/messageTypes';
import { AppError, ErrorType } from '@/services/errorService';
import { getUserProfile } from '@/services/userService';
import { arrayUnion as firestoreArrayUnion } from 'firebase/firestore';

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
   * Listen to messages in a chat (real-time) with automatic read marking
   */
  static listenToMessages(
    chatId: string,
    currentUserId: string,
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

      const unsubscribe = onSnapshot(q, async (snapshot) => {
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

        // Mark unread messages as read (except our own messages)
        const unreadMessages = messages.filter(msg => 
          msg.senderId !== currentUserId && 
          (!msg.readBy || !msg.readBy.includes(currentUserId))
        );

        if (unreadMessages.length > 0) {
          await this.markMessagesAsRead(chatId, currentUserId, unreadMessages.map(m => m.id));
        }

        // Update message statuses based on readBy array
        const updatedMessages = messages.map(msg => ({
          ...msg,
          status: this.calculateMessageStatus(msg, currentUserId)
        }));

        callback(updatedMessages);
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
   * Calculate message status based on readBy array
   */
  private static calculateMessageStatus(message: Message, currentUserId: string): 'sent' | 'read' {
    // If it's our own message
    if (message.senderId === currentUserId) {
      // Check if anyone else has read it
      const othersWhoRead = (message.readBy || []).filter(uid => uid !== currentUserId);
      return othersWhoRead.length > 0 ? 'read' : 'sent';
    }
    
    // If it's someone else's message, return sent (we don't show status for received messages)
    return 'sent';
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
      const batch = writeBatch(db);

      messageIds.forEach(messageId => {
        const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
        batch.update(messageRef, {
          readBy: arrayUnion(userId)
        });
      });

      await batch.commit();
    } catch (error) {
      console.error('Error marking messages as read:', error);
      // Don't throw error here to avoid disrupting the chat experience
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
/**
 * Helper to use Firestore's arrayUnion for updating arrays in documents.
 */
function arrayUnion<T>(...elements: T[]): unknown {
  return firestoreArrayUnion(...elements);
}
