// services/messageService.ts

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  setDoc,
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp, 
  getDoc,
  getDocs,
  where,
  Timestamp,
  writeBatch,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db } from '@/config/firebaseConfig';
import { Message, SendMessageData } from '@/types/messageTypes';
import { AppError, ErrorType } from '@/services/errorService';
import { getUserProfile } from '@/services/userService';
import { ImageService } from '@/services/imageService';
import { arrayUnion as firestoreArrayUnion } from 'firebase/firestore';

export interface MessagesPaginationResult {
  messages: Message[];
  hasMore: boolean;
  lastDoc?: QueryDocumentSnapshot<DocumentData>;
}

export class MessageService {
  // Reduced initial load for better performance
  private static DEFAULT_MESSAGE_LIMIT = 25;
  private static PAGINATION_LIMIT = 20;

  /**
   * Send a new message to a chat (supports text and images)
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
        ...(messageData.imageData && { imageData: messageData.imageData }),
        ...(messageData.replyTo && { replyTo: messageData.replyTo }),
      };

      // Add message to Firestore using addDoc (it will auto-generate ID)
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
   * Send an image message with processing
   */
  static async sendImageMessage(
    chatId: string,
    senderId: string,
    imageUri: string,
    caption: string = ''
  ): Promise<string> {
    try {
      // Get sender profile
      const senderProfile = await getUserProfile(senderId);
      if (!senderProfile) {
        throw new AppError(ErrorType.VALIDATION, 'Sender profile not found');
      }

      // Create initial message with 'sending' status
      const initialMessage: Omit<Message, 'id'> = {
        chatId,
        senderId,
        senderUsername: senderProfile.username,
        ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
        ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
        content: caption,
        type: 'image',
        timestamp: new Date().toISOString(),
        status: 'sending',
      };

      // Add initial message to Firestore using addDoc
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const docRef = await addDoc(messagesRef, {
        ...initialMessage,
        timestamp: serverTimestamp(),
      });

      const messageId = docRef.id;

      // Process image in background
      try {
        const processedImage = await ImageService.processImageForChat(
          imageUri,
          chatId,
          messageId
        );

        // Update message with image data and change status to sent
        await updateDoc(docRef, {
          imageData: {
            uri: processedImage.localUri,
            downloadURL: processedImage.downloadURL,
            width: processedImage.width,
            height: processedImage.height,
            size: processedImage.size,
          },
          status: 'sent',
        });

        return messageId;
      } catch (imageError) {
        // If image processing fails, update message status to indicate error
        await updateDoc(docRef, {
          status: 'sent', // Keep as sent but without image
          content: caption || 'Failed to upload image',
          type: 'text',
        });
        
        throw new AppError(
          ErrorType.STORAGE,
          'Failed to process image',
          imageError
        );
      }
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send image message',
        error
      );
    }
  }

  /**
   * Listen to recent messages in a chat (real-time) with automatic read marking
   * Only loads the most recent messages for real-time updates
   */
  static listenToRecentMessages(
    chatId: string,
    currentUserId: string,
    callback: (messages: Message[]) => void,
    messageLimit: number = this.DEFAULT_MESSAGE_LIMIT
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
   * Load older messages with pagination (for "Load More" functionality)
   */
  static async loadOlderMessages(
    chatId: string,
    lastDoc?: QueryDocumentSnapshot<DocumentData>,
    messageLimit: number = this.PAGINATION_LIMIT
  ): Promise<MessagesPaginationResult> {
    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      
      let q = query(
        messagesRef,
        orderBy('timestamp', 'desc'),
        limit(messageLimit)
      );

      // If we have a lastDoc (cursor), start after it
      if (lastDoc) {
        q = query(
          messagesRef,
          orderBy('timestamp', 'desc'),
          startAfter(lastDoc),
          limit(messageLimit)
        );
      }

      const snapshot = await getDocs(q);
      
      const messages: Message[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp instanceof Timestamp 
            ? data.timestamp.toDate().toISOString()
            : data.timestamp,
        } as Message;
      }).reverse(); // Reverse to show oldest first

      // Get the last document for pagination cursor
      const newLastDoc = snapshot.docs[snapshot.docs.length - 1];
      const hasMore = snapshot.docs.length === messageLimit;

      return {
        messages,
        hasMore,
        lastDoc: newLastDoc,
      };
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to load older messages',
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
   * Delete a message
   */
  static async deleteMessage(chatId: string, messageId: string): Promise<void> {
    try {
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, {
        content: 'This message was deleted',
        type: 'deleted',
        editedAt: new Date().toISOString(),
        // Remove image data if it exists
        imageData: null,
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
   * Edit a message (text only)
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