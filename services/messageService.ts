// services/messageService.ts

import * as ImagePicker from 'expo-image-picker';
import {
  addDoc,
  collection,
  doc,
  DocumentData,
  arrayUnion as firestoreArrayUnion,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/config/firebaseConfig';
import { ChatService } from '@/services/chatService';
import { AppError, ErrorType } from '@/services/errorService';
import { ImageService } from '@/services/imageService';
import { getUserProfile } from '@/services/userService';
import { VideoService } from '@/services/videoService';
import { Chat, Message, SendMessageData } from '@/types/messageTypes';

export interface MessagesPaginationResult {
  messages: Message[];
  hasMore: boolean;
  lastDoc?: QueryDocumentSnapshot<DocumentData>;
}

export class MessageService {
  private static readonly DEFAULT_MESSAGE_LIMIT = 25;
  private static readonly PAGINATION_LIMIT = 20;
  private static readonly FAILED_DECRYPT_MESSAGE = '🔒 Failed to decrypt message';
  private static readonly IMAGE_UPLOAD_FAILED_MESSAGE = 'Failed to upload image';
  private static readonly VIDEO_UPLOAD_FAILED_MESSAGE = 'Failed to upload video';
  private static readonly DELETED_MESSAGE_CONTENT = 'This message was deleted';

  // =====================================
  // UTILITY METHODS
  // =====================================

  /**
   * Safely converts Firestore timestamps to ISO strings
   */
  private static convertTimestamp(timestamp: any): string {
    if (!timestamp) {
      return new Date().toISOString();
    }

    if (timestamp && typeof timestamp === 'object' && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toISOString();
    }

    if (typeof timestamp === 'string') {
      return timestamp;
    }

    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }

    return new Date().toISOString();
  }


  /**
   * Creates base message object with sender information
   */
  private static async createBaseMessage(
    chatId: string,
    senderId: string,
    messageData: Partial<SendMessageData>
  ): Promise<Omit<Message, 'id'>> {
    const senderProfile = await getUserProfile(senderId);
    if (!senderProfile) {
      throw new AppError(ErrorType.VALIDATION, 'Sender profile not found');
    }

    return {
      chatId,
      senderId,
      senderUsername: senderProfile.username,
      ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
      ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
      content: messageData.content || '',
      type: messageData.type || 'text',
      timestamp: new Date().toISOString(),
      status: 'sending',
      isEncrypted: false,
      ...(messageData.imageData && { imageData: messageData.imageData }),
      ...(messageData.videoData && { videoData: messageData.videoData }),
      ...(messageData.replyTo && { replyTo: messageData.replyTo }),
    };
  }

  // =====================================
  // ENCRYPTION HELPERS
  // =====================================

  /**
   * Handles message encryption for secret chats
   */
  private static async handleEncryption(
    content: string,
    chat: any,
    shouldEncrypt?: boolean
  ): Promise<{ finalContent: string; encryptedContent?: string; isEncrypted: boolean }> {
    if (shouldEncrypt) {
      console.warn("🔐 encryption and decryption will be implemented later");
    }
    return { finalContent: content, isEncrypted: false };
  }

  /**
   * Handles message decryption for display
   */
  private static async handleDecryption(
    messages: any[],
    chat: Chat | null
  ): Promise<Message[]> {
    if (chat?.encryptionEnabled || chat?.isSecretChat) {
      console.warn("🔐 decryption will be implemented later");
    }
    return messages.map(msg => ({
      ...msg,
      content: msg.isEncrypted ? this.FAILED_DECRYPT_MESSAGE : msg.content,
      timestamp: this.convertTimestamp(msg.timestamp),
    }));
  }

  // =====================================
  // MESSAGE SENDING METHODS
  // =====================================

  /**
   * Sends a text message to a chat
   */
  static async sendMessage(
    chatId: string,
    senderId: string,
    receiverId: string,
    messageData: SendMessageData,
  ): Promise<string> {
    try {
      const chat = await ChatService.getChatById(chatId);
      const baseMessage = await this.createBaseMessage(chatId, senderId, messageData);

      const { finalContent, encryptedContent, isEncrypted } = await this.handleEncryption(
        messageData.content || '',
        chat,
        messageData.shouldEncrypt
      );

      let processedImage;
      if (messageData.type === 'image' && messageData.imageData) {
        const messageId = ImageService.generateImageMessageId();
        processedImage = await ImageService.processImageForChat(messageData.imageData.uri, chatId, messageId);
      }

      let processedVideo;
      if (messageData.type === 'video' && messageData.videoData) {
        const messageId = VideoService.generateVideoMessageId();
        processedVideo = await VideoService.processVideoForChat(messageData.videoData, chatId, messageId);
      }

      const message: Omit<Message, 'id'> = {
        ...baseMessage,
        content: finalContent,
        isEncrypted,
        ...(encryptedContent && { encryptedContent }),
        ...(messageData.type === 'image' && processedImage && { imageData: processedImage }),
        ...(messageData.type === 'video' && processedVideo && { videoData: processedVideo }),
      };

      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const docRef = await addDoc(messagesRef, {
        ...message,
        timestamp: serverTimestamp(),
      });


      await updateDoc(docRef, { status: 'sent' });
      // 🔐 Update last message in chat with encryption support
      const lastMessageContent = finalContent || (messageData.type === 'image' ? '📷 Photo' : messageData.type === 'video' ? '🎥 Video' : '');

      await ChatService.updateLastMessage(
        chatId,
        senderId,
        baseMessage.senderUsername,
        lastMessageContent,
        messageData.type,
        isEncrypted
      );
      await ChatService.incrementUnreadCount(chatId, receiverId);
      return docRef.id;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }
  // =====================================
  // MESSAGE RETRIEVAL METHODS
  // =====================================

  /**
   * Loads older messages with pagination
   */
  static async loadOlderMessages(
    chatId: string,
    lastDoc?: QueryDocumentSnapshot<DocumentData>,
    messageLimit: number = this.PAGINATION_LIMIT
  ): Promise<MessagesPaginationResult> {
    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');

      let q = query(messagesRef, orderBy('timestamp', 'desc'), limit(messageLimit));

      if (lastDoc) {
        q = query(messagesRef, orderBy('timestamp', 'desc'), startAfter(lastDoc), limit(messageLimit));
      }

      const snapshot = await getDocs(q);
      const chat = await ChatService.getChatById(chatId);
      const messages = await this.handleDecryption(snapshot.docs.map(doc => doc.data()), chat);

      return {
        messages: messages.reverse(), // Show oldest first
        hasMore: snapshot.docs.length === messageLimit,
        lastDoc: snapshot.docs[snapshot.docs.length - 1],
      };
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to load older messages',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  // =====================================
  // MESSAGE MANAGEMENT METHODS
  // =====================================

  /**
   * Marks all messages from other users as read if they are in 'sent' status
   * This is typically called when a user opens a chat to mark all unread messages as read
   */
  static async markOtherUsersMessagesAsRead(
    chatId: string,
    currentUserId: string
  ): Promise<void> {
    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      
      // Query for messages with status 'sent' only to avoid composite index requirement
      // We'll filter out current user's messages in the client
      const q = query(
        messagesRef,
        where('status', '==', 'sent')
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return; // No messages to mark as read
      }

      const batch = writeBatch(db);
      const messageIds: string[] = [];

      snapshot.docs.forEach(docSnapshot => {
        const messageData = docSnapshot.data();
        const readBy = messageData.readBy || [];
        
        // Filter out messages from current user and already read messages
        if (messageData.senderId !== currentUserId && !readBy.includes(currentUserId)) {
          const messageRef = doc(db, 'chats', chatId, 'messages', docSnapshot.id);
          batch.update(messageRef, {
            readBy: firestoreArrayUnion(currentUserId),
            status: 'read' // Update status to 'read' as well
          });
          messageIds.push(docSnapshot.id);
        }
      });

      if (messageIds.length > 0) {
        await batch.commit();
        // console.log(`Marked ${messageIds.length} messages as read for user ${currentUserId} in chat ${chatId}`);
      }
      console.log(`Marked ${messageIds.length} messages as read for user ${currentUserId} in chat ${chatId}`);
      await ChatService.markChatAsRead(chatId, currentUserId);
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to mark other users\' messages as read',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Marks multiple messages as read by a user
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
          readBy: firestoreArrayUnion(userId),
        });
      });

      await batch.commit();
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to mark messages as read',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Deletes a message (soft delete)
   */
  static async deleteMessage(chatId: string, messageId: string): Promise<void> {
    try {
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, {
        content: this.DELETED_MESSAGE_CONTENT,
        type: 'deleted',
        editedAt: new Date().toISOString(),
        isEncrypted: false,
        encryptedContent: null,
        imageData: null,
        videoData: null,
      });
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to delete message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Edits a message (text only)
   */
  static async editMessage(
    chatId: string,
    messageId: string,
    newContent: string
  ): Promise<void> {
    try {
      const chat = await ChatService.getChatById(chatId);
      const { finalContent, encryptedContent, isEncrypted } = await this.handleEncryption(
        newContent,
        chat
      );

      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, {
        content: finalContent,
        editedAt: new Date().toISOString(),
        isEncrypted,
        ...(encryptedContent && { encryptedContent }),
      });
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to edit message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }
}