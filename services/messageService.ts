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
import { VideoService } from '@/services/videoService';
import { EncryptionService } from '@/services/encryptionService'; // 🔐 NEW
import { ChatService } from '@/services/chatService'; // 🔐 NEW
import { arrayUnion as firestoreArrayUnion } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';

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
   * Send a new message to a chat - UPDATED WITH ENCRYPTION SUPPORT
   * 🔐 Now automatically encrypts messages in secret chats
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

      // 🔐 Check if this is a secret chat
      const chat = await ChatService.getChatById(chatId);
      const shouldEncrypt = chat?.isSecretChat || chat?.encryptionEnabled || messageData.shouldEncrypt;

      let finalContent = messageData.content;
      let encryptedContent: string | undefined;

      // 🔐 Encrypt message if needed
      if (shouldEncrypt && messageData.type === 'text' && messageData.content) {
        try {
          const chatKey = await EncryptionService.generateChatKey(
            chat!.participants[0], 
            chat!.participants[1]
          );
          encryptedContent = await EncryptionService.encryptMessage(messageData.content, chatKey);
          // For storage, we keep the encrypted version
          finalContent = encryptedContent;
        } catch (error) {
          console.error('Failed to encrypt message:', error);
          if (error instanceof AppError) {
            console.log('🔴 Encryption error:', error.type)
            console.log('🔴 Encryption error message:', error.originalError);
          }
          // If encryption fails, send unencrypted (with warning in UI)
          shouldEncrypt && console.warn('Message sent unencrypted due to encryption failure');
        }
      }

      const message: Omit<Message, 'id'> = {
        chatId,
        senderId,
        senderUsername: senderProfile.username,
        ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
        ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
        content: finalContent, // 🔐 May be encrypted
        type: messageData.type,
        timestamp: new Date().toISOString(),
        status: 'sending',
        // 🔐 Encryption metadata
        isEncrypted: !!shouldEncrypt && !!encryptedContent,
        ...(encryptedContent && { encryptedContent }),
        ...(messageData.imageData && { imageData: messageData.imageData }),
        ...(messageData.videoData && { videoData: messageData.videoData }),
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
   * Send an image message with processing - UPDATED WITH ENCRYPTION
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

      // 🔐 Check if this is a secret chat
      const chat = await ChatService.getChatById(chatId);
      const shouldEncrypt = chat?.isSecretChat || chat?.encryptionEnabled;

      // STEP 1: Process image first (compress and upload)
      const messageId = ImageService.generateImageMessageId();
      
      try {
        const processedImage = await ImageService.processImageForChat(
          imageUri,
          chatId,
          messageId
        );

        // 🔐 Encrypt caption if needed
        let finalCaption = caption;
        let encryptedContent: string | undefined;
        
        if (shouldEncrypt && caption) {
          try {
            const chatKey = await EncryptionService.generateChatKey(
              chat!.participants[0], 
              chat!.participants[1]
            );
            encryptedContent = await EncryptionService.encryptMessage(caption, chatKey);
            finalCaption = encryptedContent;
          } catch (error) {
            console.error('Failed to encrypt image caption:', error);
          }
        }

        // STEP 2: Create complete message with image data
        const message: Omit<Message, 'id'> = {
          chatId,
          senderId,
          senderUsername: senderProfile.username,
          ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
          ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
          content: finalCaption, // 🔐 May be encrypted
          type: 'image',
          timestamp: new Date().toISOString(),
          status: 'sent',
          // 🔐 Encryption metadata
          isEncrypted: shouldEncrypt && !!encryptedContent,
          ...(encryptedContent && { encryptedContent }),
          imageData: {
            uri: processedImage.localUri,
            downloadURL: processedImage.downloadURL,
            width: processedImage.width,
            height: processedImage.height,
            size: processedImage.size,
          },
        };

        // STEP 3: Add complete message to Firestore
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await setDoc(doc(messagesRef, messageId), {
          ...message,
          timestamp: serverTimestamp(),
        });

        return messageId;
      } catch (imageError) {
        // If image processing fails, create a text message instead
        const failureMessage: Omit<Message, 'id'> = {
          chatId,
          senderId,
          senderUsername: senderProfile.username,
          ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
          ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
          content: 'Failed to upload image',
          type: 'text',
          timestamp: new Date().toISOString(),
          status: 'sent',
        };

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const docRef = await addDoc(messagesRef, {
          ...failureMessage,
          timestamp: serverTimestamp(),
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
   * Send a video message with processing - UPDATED WITH ENCRYPTION
   */
  static async sendVideoMessage(
    chatId: string,
    senderId: string,
    video: ImagePicker.ImagePickerAsset,
    caption: string = ''
  ): Promise<string> {
    try {
      // Get sender profile
      const senderProfile = await getUserProfile(senderId);
      if (!senderProfile) {
        throw new AppError(ErrorType.VALIDATION, 'Sender profile not found');
      }

      // 🔐 Check if this is a secret chat
      const chat = await ChatService.getChatById(chatId);
      const shouldEncrypt = chat?.isSecretChat || chat?.encryptionEnabled;

      // STEP 1: Process video first (validate and upload)
      const messageId = VideoService.generateVideoMessageId();
      
      try {
        const processedVideo = await VideoService.processVideoForChat(
          video,
          chatId,
          messageId
        );

        // 🔐 Encrypt caption if needed
        let finalCaption = caption;
        let encryptedContent: string | undefined;
        
        if (shouldEncrypt && caption) {
          try {
            const chatKey = await EncryptionService.generateChatKey(
              chat!.participants[0], 
              chat!.participants[1]
            );
            encryptedContent = await EncryptionService.encryptMessage(caption, chatKey);
            finalCaption = encryptedContent;
          } catch (error) {
            console.error('Failed to encrypt video caption:', error);
          }
        }

        // STEP 2: Create complete message with video data
        const message: Omit<Message, 'id'> = {
          chatId,
          senderId,
          senderUsername: senderProfile.username,
          ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
          ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
          content: finalCaption, // 🔐 May be encrypted
          type: 'video',
          timestamp: new Date().toISOString(),
          status: 'sent',
          // 🔐 Encryption metadata
          isEncrypted: shouldEncrypt && !!encryptedContent,
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

        // STEP 3: Add complete message to Firestore
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await setDoc(doc(messagesRef, messageId), {
          ...message,
          timestamp: serverTimestamp(),
        });

        return messageId;
      } catch (videoError) {
        // If video processing fails, create a text message instead
        const failureMessage: Omit<Message, 'id'> = {
          chatId,
          senderId,
          senderUsername: senderProfile.username,
          ...(senderProfile.displayName && { senderDisplayName: senderProfile.displayName }),
          ...(senderProfile.profilePicture && { senderProfilePicture: senderProfile.profilePicture }),
          content: 'Failed to upload video',
          type: 'text',
          timestamp: new Date().toISOString(),
          status: 'sent',
        };

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        await addDoc(messagesRef, {
          ...failureMessage,
          timestamp: serverTimestamp(),
        });
        
        throw new AppError(
          ErrorType.STORAGE,
          'Failed to process video',
          videoError
        );
      }
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to send video message',
        error
      );
    }
  }

  /**
   * Listen to recent messages in a chat - UPDATED WITH DECRYPTION
   * 🔐 Now automatically decrypts encrypted messages for display
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
        // 🔐 Get chat info for decryption
        const chat = await ChatService.getChatById(chatId);
        let chatKey: string | null = null;
        
        if (chat && (chat.isSecretChat || chat.encryptionEnabled)) {
          try {
            chatKey = await EncryptionService.generateChatKey(
              chat.participants[0], 
              chat.participants[1]
            );
          } catch (error) {
            console.error('Failed to generate chat key:', error);
          }
        }

        const messages: Message[] = snapshot.docs.map(doc => {
          const data = doc.data();
          
          // 🔐 Decrypt message content if encrypted
          let decryptedContent = data.content;
          if (data.isEncrypted && chatKey && data.content) {
            try {
              decryptedContent = EncryptionService.decryptMessage(data.content, chatKey);
            } catch (error) {
              console.error('Failed to decrypt message:', error);
              decryptedContent = '🔒 Failed to decrypt message';
            }
          }
          
          const message = {
            id: doc.id,
            ...data,
            content: decryptedContent, // 🔐 Use decrypted content for display
            // Convert Firestore timestamp to ISO string safely
            timestamp: this.convertTimestamp(data.timestamp),
          } as Message;
          
          return message;
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
        console.error('❌ Error listening to messages:', error);
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
   * Load older messages with pagination - UPDATED WITH DECRYPTION
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
      
      // 🔐 Get chat info for decryption
      const chat = await ChatService.getChatById(chatId);
      let chatKey: string | null = null;
      
      if (chat && (chat.isSecretChat || chat.encryptionEnabled)) {
        try {
          chatKey = await EncryptionService.generateChatKey(
            chat.participants[0], 
            chat.participants[1]
          );
        } catch (error) {
          console.error('Failed to generate chat key:', error);
        }
      }
      
      const messages: Message[] = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // 🔐 Decrypt message content if encrypted
        let decryptedContent = data.content;
        if (data.isEncrypted && chatKey && data.content) {
          try {
            decryptedContent = EncryptionService.decryptMessage(data.content, chatKey);
          } catch (error) {
            console.error('Failed to decrypt message:', error);
            decryptedContent = '🔒 Failed to decrypt message';
          }
        }
        
        return {
          id: doc.id,
          ...data,
          content: decryptedContent, // 🔐 Use decrypted content
          timestamp: this.convertTimestamp(data.timestamp),
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
        // 🔐 Clear encryption data when deleting
        isEncrypted: false,
        encryptedContent: null,
        // Remove media data if it exists
        imageData: null,
        videoData: null,
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
   * Edit a message (text only) - UPDATED WITH ENCRYPTION
   */
  static async editMessage(
    chatId: string, 
    messageId: string, 
    newContent: string
  ): Promise<void> {
    try {
      // 🔐 Check if this message should be encrypted
      const chat = await ChatService.getChatById(chatId);
      const shouldEncrypt = chat?.isSecretChat || chat?.encryptionEnabled;
      
      let finalContent = newContent;
      let encryptedContent: string | undefined;
      
      if (shouldEncrypt) {
        try {
          const chatKey = await EncryptionService.generateChatKey(
            chat!.participants[0], 
            chat!.participants[1]
          );
          encryptedContent = await EncryptionService.encryptMessage(newContent, chatKey);
          finalContent = encryptedContent;
        } catch (error) {
          console.error('Failed to encrypt edited message:', error);
        }
      }
      
      const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
      await updateDoc(messageRef, {
        content: finalContent, // 🔐 May be encrypted
        editedAt: new Date().toISOString(),
        // 🔐 Update encryption metadata
        isEncrypted: shouldEncrypt && !!encryptedContent,
        ...(encryptedContent && { encryptedContent }),
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
