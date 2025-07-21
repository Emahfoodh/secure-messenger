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
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/config/firebaseConfig';
import { ChatService } from '@/services/chatService';
import { AppError, ErrorType } from '@/services/errorService';
import { ImageService } from '@/services/imageService';
import { getUserProfile } from '@/services/userService';
import { VideoService } from '@/services/videoService';
import { Message, SendMessageData } from '@/types/messageTypes';

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
   * Calculates message status based on readBy array
   */
  private static calculateMessageStatus(message: Message, currentUserId: string): 'sent' | 'read' {
    if (message.senderId === currentUserId) {
      const othersWhoRead = (message.readBy || []).filter(uid => uid !== currentUserId);
      return othersWhoRead.length > 0 ? 'read' : 'sent';
    }
    return 'sent';
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
    console.warn("🔐 encryption and decryption will be implemented later");
    return { finalContent: content, isEncrypted: false };
  }

  /**
   * Handles message decryption for display
   */
  private static async handleDecryption(
    messages: any[],
    chat: any
  ): Promise<Message[]> {
    console.warn("🔐 decryption will be implemented later");
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
    messageData: SendMessageData
  ): Promise<string> {
    try {
      const chat = await ChatService.getChatById(chatId);
      const baseMessage = await this.createBaseMessage(chatId, senderId, messageData);

      const { finalContent, encryptedContent, isEncrypted } = await this.handleEncryption(
        messageData.content || '',
        chat,
        messageData.shouldEncrypt
      );

      const message: Omit<Message, 'id'> = {
        ...baseMessage,
        content: finalContent,
        isEncrypted,
        ...(encryptedContent && { encryptedContent }),
      };

      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const docRef = await addDoc(messagesRef, {
        ...message,
        timestamp: serverTimestamp(),
      });

      await updateDoc(docRef, { status: 'sent' });
      return docRef.id;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Sends an image message with processing
   */
  static async sendImageMessage(
    chatId: string,
    senderId: string,
    imageUri: string,
    caption: string = ''
  ): Promise<string> {
    try {
      const chat = await ChatService.getChatById(chatId);
      const messageId = ImageService.generateImageMessageId();

      try {
        const processedImage = await ImageService.processImageForChat(imageUri, chatId, messageId);
        const baseMessage = await this.createBaseMessage(chatId, senderId, { type: 'image' });

        const { finalContent, encryptedContent, isEncrypted } = await this.handleEncryption(
          caption,
          chat
        );

        const message: Omit<Message, 'id'> = {
          ...baseMessage,
          content: finalContent,
          type: 'image',
          status: 'sent',
          isEncrypted,
          ...(encryptedContent && { encryptedContent }),
          imageData: {
            uri: processedImage.localUri,
            downloadURL: processedImage.downloadURL,
            width: processedImage.width,
            height: processedImage.height,
            size: processedImage.size,
          },
        };

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await setDoc(doc(messagesRef, messageId), {
          ...message,
          timestamp: serverTimestamp(),
        });

        return messageId;
      } catch (imageError: any) {
        // Fallback to failure message
        await this.sendFailureMessage(chatId, senderId, this.IMAGE_UPLOAD_FAILED_MESSAGE);
        throw new AppError(
          ErrorType.STORAGE,
          'Failed to process image',
          imageError instanceof AppError ? imageError : imageError instanceof Error ? imageError : new Error(imageError)
        );
      }
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send image message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Sends a video message with processing
   */
  static async sendVideoMessage(
    chatId: string,
    senderId: string,
    video: ImagePicker.ImagePickerAsset,
    caption: string = ''
  ): Promise<string> {
    try {
      const chat = await ChatService.getChatById(chatId);
      const messageId = VideoService.generateVideoMessageId();

      try {
        const processedVideo = await VideoService.processVideoForChat(video, chatId, messageId);
        const baseMessage = await this.createBaseMessage(chatId, senderId, { type: 'video' });

        const { finalContent, encryptedContent, isEncrypted } = await this.handleEncryption(
          caption,
          chat
        );

        const message: Omit<Message, 'id'> = {
          ...baseMessage,
          content: finalContent,
          type: 'video',
          status: 'sent',
          isEncrypted,
          ...(encryptedContent && { encryptedContent }),
          videoData: {
            uri: processedVideo.localUri,
            downloadURL: processedVideo.downloadURL,
            duration: processedVideo.duration,
            width: processedVideo.width,
            height: processedVideo.height,
            size: processedVideo.size,
          },
        };

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await setDoc(doc(messagesRef, messageId), {
          ...message,
          timestamp: serverTimestamp(),
        });

        return messageId;
      } catch (videoError: any) {
        // Fallback to failure message
        await this.sendFailureMessage(chatId, senderId, this.VIDEO_UPLOAD_FAILED_MESSAGE);
        throw new AppError(
          ErrorType.STORAGE,
          'Failed to process video',
          videoError instanceof AppError ? videoError : videoError instanceof Error ? videoError : new Error(videoError)
        );
      }
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send video message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Sends a failure message when media processing fails
   */
  private static async sendFailureMessage(
    chatId: string,
    senderId: string,
    content: string
  ): Promise<void> {
    try {
      const baseMessage = await this.createBaseMessage(chatId, senderId, { content, type: 'text' });
      const failureMessage: Omit<Message, 'id'> = {
        ...baseMessage,
        content,
        type: 'text',
        status: 'sent',
      };

      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        ...failureMessage,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to send failure message:', error);
    }
  }

  // =====================================
  // MESSAGE RETRIEVAL METHODS
  // =====================================

  /**
   * Sets up real-time listener for recent messages in a chat
   */
  static listenToRecentMessages(
    chatId: string,
    currentUserId: string,
    callback: (messages: Message[]) => void,
    messageLimit: number = this.DEFAULT_MESSAGE_LIMIT
  ): () => void {
    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(messageLimit));

      const unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const chat = await ChatService.getChatById(chatId);
          const messages = await this.handleDecryption(snapshot.docs, chat);
          const reversedMessages = messages.reverse(); // Show oldest first

          // Mark unread messages as read
          const unreadMessages = reversedMessages.filter(
            msg => msg.senderId !== currentUserId && (!msg.readBy || !msg.readBy.includes(currentUserId))
          );

          if (unreadMessages.length > 0) {
            await this.markMessagesAsRead(chatId, currentUserId, unreadMessages.map(m => m.id));
          }

          // Update message statuses
          const updatedMessages = reversedMessages.map(msg => ({
            ...msg,
            status: this.calculateMessageStatus(msg, currentUserId),
          }));

          callback(updatedMessages);
        },
        (error: any) => {
          throw new AppError(
            ErrorType.STORAGE,
            'Failed to load messages',
            error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
          );
        }
      );

      return unsubscribe;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to set up message listener',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

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
      const messages = await this.handleDecryption(snapshot.docs, chat);

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
    } catch (error) {
      console.error('Error marking messages as read:', error);
      // Don't throw error to avoid disrupting chat experience
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