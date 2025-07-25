// services/ChatSystemService.ts

import { Chat, Message, SendMessageData } from '@/types/messageTypes';
import { AppError, ErrorType } from '@/services/errorService';
import { getUserProfile } from '@/services/userService';
import { DatabaseService } from '@/services/databaseService';
import { FirebaseMessageService } from '@/services/firebaseMessageService';
import { firebaseChatService } from '@/services/firebaseChatService';
import { Contact } from '@/services/contactService';
import { UserProfile } from '@/services/userService';

export class ChatSystemService {
  // =====================================
  // ENCRYPTION HELPERS
  // =====================================

  /**
   * Handles message encryption for secret chats
   */
  private static async handleEncryption(
    content: string,
    chat: Chat | null,
  ): Promise<{ finalContent: string; encryptedContent?: string; isEncrypted: boolean }> {
    if (chat?.encryptionEnabled || chat?.isSecretChat) {
      console.warn("🔐 encryption and decryption will be implemented later");
    }
    return { finalContent: content, isEncrypted: false };
  }

  /**
   * Handles message decryption for display
   */
  private static async handleDecryption(
    content: string,
    isEncrypted: boolean,
    chat: Chat | null
  ): Promise<string> {
    if ((chat?.encryptionEnabled || chat?.isSecretChat) && isEncrypted) {
      console.warn("🔐 encryption and decryption will be implemented later");
      return '🔒 Failed to decrypt message';
    }
    return content;
  }

  // =====================================
  // MESSAGE CREATION
  // =====================================

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
      // isEncrypted will be set in sendMessage after encryption handler
      ...(messageData.imageData && { imageData: messageData.imageData }),
      ...(messageData.videoData && { videoData: messageData.videoData }),
      ...(messageData.replyTo && { replyTo: messageData.replyTo }),
    };
  }

  // =====================================
  // SEND MESSAGE
  // =====================================

  /**
   * Sends a message to a chat
   */
  static async sendMessage(
    chatId: string,
    senderId: string,
    receiverId: string,
    messageData: SendMessageData,
  ): Promise<string> {
    try {
      // Get chat details for encryption handling
      const chat = await DatabaseService.getChatById(chatId);
      
      // Create base message
      const baseMessage = await this.createBaseMessage(chatId, senderId, messageData);

      // Handle encryption
      const { finalContent, encryptedContent, isEncrypted } = await this.handleEncryption(
        messageData.content || '',
        chat,
      );

      // Create final message with encryption data
      const message: Omit<Message, 'id'> = {
        ...baseMessage,
        content: finalContent,
        isEncrypted,
        ...(encryptedContent && { encryptedContent }),
      };

      // Save to local database first
      const tempId = `temp_${Date.now()}_${Math.random()}`;
      const localMessage: Message = { ...baseMessage, id: tempId };
      await DatabaseService.insertMessage(localMessage);

      // Update local chat with last message
      await DatabaseService.updateChatLastMessage(
        chatId,
        finalContent || (messageData.type === 'image' ? '📷 Photo' : messageData.type === 'video' ? '🎥 Video' : ''),
        senderId,
        baseMessage.senderUsername,
        baseMessage.timestamp,
        messageData.type,
        isEncrypted
      );


      // Send to Firebase
      const firebaseMessageId = await FirebaseMessageService.sendMessage(
        chatId,
        senderId,
        receiverId,
        messageData
      );

      // Update local message with real Firebase ID
      await DatabaseService.updateMessageId(tempId, firebaseMessageId);
      await DatabaseService.updateMessageStatus(firebaseMessageId, 'sent');

      return firebaseMessageId;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  // =====================================
  // RECEIVE MESSAGE
  // =====================================

  /**
   * Handles incoming message from Firebase
   */
  static async receiveMessage(message: Message): Promise<void> {
    try {
      // Get chat details for decryption
      const chat = await DatabaseService.getChatById(message.chatId);

      // Decrypt message content
      const decryptedContent = await this.handleDecryption(
        message.content || '',
        message.isEncrypted || false,
        chat
      );

      // Create decrypted message
      const decryptedMessage: Message = {
        ...message,
        content: decryptedContent,
      };

      // Save to local database
      await DatabaseService.insertMessage(decryptedMessage);

      // Update local chat with last message
      await DatabaseService.updateChatLastMessage(
        message.chatId,
        decryptedContent || (message.type === 'image' ? '📷 Photo' : message.type === 'video' ? '🎥 Video' : ''),
        message.senderId,
        message.senderUsername,
        message.timestamp,
        message.type,
        message.isEncrypted || false
      );
      
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to receive message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  // =====================================
  // UPDATE MESSAGE
  // =====================================

  /**
   * Edits a message content
   */
  static async editMessage(
    chatId: string,
    messageId: string,
    newContent: string
  ): Promise<void> {
    try {
      // Get chat details for encryption handling
      const chat = await DatabaseService.getChatById(chatId);
      
      // Handle encryption for the new content
      const { finalContent, encryptedContent, isEncrypted } = await this.handleEncryption(
        newContent,
        chat,
      );

      // First, try to update in Firebase
      await FirebaseMessageService.editMessage(chatId,messageId, finalContent);

      // If Firebase update was successful, update locally
      await DatabaseService.editMessage(
        messageId, 
        newContent, 
        isEncrypted,
        encryptedContent 
      );

      // Update chat's last message if this was the most recent message
      const existingChat = await DatabaseService.getChatById(chatId);
      if (existingChat?.lastMessage) {
        // Get the message to check if it's the last message
        const messages = await DatabaseService.getChatMessages(chatId, 1, 0);
        if (messages.length > 0 && messages[0].id === messageId) {
          // This is the last message, update chat's last message content
          await DatabaseService.updateChatLastMessage(
            chatId,
            finalContent || (messages[0].type === 'image' ? '📷 Photo' : messages[0].type === 'video' ? '🎥 Video' : ''),
            messages[0].senderId,
            messages[0].senderUsername,
            messages[0].timestamp,
            messages[0].type,
            isEncrypted
          );
        }
      }

      console.log('✅ Message edited successfully:', { 
        messageId, 
        chatId,
        isEncrypted,
        contentPreview: finalContent.substring(0, 50) + (finalContent.length > 50 ? '...' : '')
      });

    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to edit message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  static async deleteMessage(
    chatId: string,
    messageId: string
  ): Promise<void> {
    try {
      // First delete from Firebase
      await FirebaseMessageService.deleteMessage(chatId, messageId);
      // Then delete from local database
      await DatabaseService.deleteMessage(messageId);
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to delete message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Handles message updates from Firebase
   */
  static async updateMessage(message: Message): Promise<void> {
    try {
      // Get chat details for decryption
      const chat = await DatabaseService.getChatById(message.chatId);

      // Decrypt message content if needed
      const decryptedContent = await this.handleDecryption(
        message.content || '',
        message.isEncrypted || false,
        chat
      );

      // Create decrypted message
      const decryptedMessage: Message = {
        ...message,
        content: decryptedContent,
      };

      // Update in local database
      await DatabaseService.insertMessage(decryptedMessage); // upsert behavior

      // If this is the last message in the chat, update chat's last message
      const existingChat = await DatabaseService.getChatById(message.chatId);
      if (existingChat?.lastMessage?.timestamp === message.timestamp) {
        await DatabaseService.updateChatLastMessage(
          message.chatId,
          decryptedContent || (message.type === 'image' ? '📷 Photo' : message.type === 'video' ? '🎥 Video' : ''),
          message.senderId,
          message.senderUsername,
          message.timestamp,
          message.type,
          message.isEncrypted || false
        );
      }
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }
  

  // =====================================
  // CREATE CHAT
  // =====================================

  /**
   * Creates a new chat
   */
  static async createChat(
    currentUser: UserProfile,
    contact: Contact,
    isSecretChat: boolean = false
  ): Promise<string> {
    try {
      // Create chat using Firebase service
      const chatId = await firebaseChatService.createChat(currentUser, contact, isSecretChat);

      // Get the created chat from Firebase
      const chat = await firebaseChatService.getChatById(chatId);

      // Save to local database
      await DatabaseService.upsertChat(chat);

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
}