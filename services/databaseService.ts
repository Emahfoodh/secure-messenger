// services/databaseService.ts

import * as SQLite from 'expo-sqlite';
import { Chat, ChatParticipant, Message, MessageType, MessageStatus, ImageData, VideoData } from '@/types/messageTypes';
import { AppError, ErrorType } from '@/services/errorService';

export interface LocalChatListItem {
  chat: Chat;
  otherParticipant: {
    uid: string;
    username: string;
    displayName?: string;
    profilePicture?: string;
  };
  unreadCount: number;
  lastMessage?: {
    content: string;
    senderId: string;
    senderUsername: string;
    timestamp: string;
    isOwnMessage: boolean;
    isEncrypted?: boolean;
  };
}

export class DatabaseService {
  private static db: SQLite.SQLiteDatabase | null = null;
  private static readonly DB_NAME = 'chat_app.db';
  private static readonly DB_VERSION = 1;

  /**
   * Initialize the database and create tables
   */
  static async initialize(): Promise<void> {
    try {
      console.log('🔄 Opening database...');
      this.db = await SQLite.openDatabaseAsync(this.DB_NAME);
      
      console.log('🔄 Creating tables...');
      await this.createTables();
      
      console.log('✅ Database initialized successfully');
      console.log('📊 Database ready for operations');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to initialize database',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Create all necessary tables
   */
  private static async createTables(): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      // Create chats table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY,
          participants TEXT NOT NULL, -- JSON array of participant IDs
          participant_details TEXT NOT NULL, -- JSON array of ChatParticipant objects
          last_message_content TEXT,
          last_message_sender_id TEXT,
          last_message_sender_username TEXT,
          last_message_timestamp TEXT,
          last_message_type TEXT DEFAULT 'text',
          last_message_is_encrypted INTEGER DEFAULT 0,
          last_activity TEXT NOT NULL,
          created_at TEXT NOT NULL,
          created_by TEXT NOT NULL,
          unread_count TEXT NOT NULL, -- JSON object with userId: count mapping
          is_active INTEGER DEFAULT 1,
          is_secret_chat INTEGER DEFAULT 0,
          encryption_enabled INTEGER DEFAULT 0,
          session_keys TEXT -- JSON object with encrypted session keys
        );
      `);
      console.log('✅ Chats table created successfully');

      // Create messages table
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          sender_username TEXT NOT NULL,
          sender_display_name TEXT,
          sender_profile_picture TEXT,
          content TEXT,
          type TEXT NOT NULL DEFAULT 'text',
          timestamp TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'sent',
          read_by TEXT, -- JSON array of user IDs
          is_edited INTEGER DEFAULT 0,
          edited_at TEXT,
          is_encrypted INTEGER DEFAULT 0,
          encrypted_content TEXT,
          deleted_at TEXT,
          -- Image data fields
          image_uri TEXT,
          image_download_url TEXT,
          image_width INTEGER,
          image_height INTEGER,
          image_size INTEGER,
          -- Video data fields
          video_uri TEXT,
          video_download_url TEXT,
          video_thumbnail_url TEXT,
          video_duration INTEGER,
          video_width INTEGER,
          video_height INTEGER,
          video_size INTEGER,
          -- Reply data fields
          reply_to_message_id TEXT,
          reply_to_content TEXT,
          reply_to_sender_username TEXT,
          FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Messages table created successfully');

      // Create indexes for better performance
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_chat_id_timestamp 
        ON messages (chat_id, timestamp);
      `);
      console.log('✅ Index idx_messages_chat_id_timestamp created successfully');

      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_sender_id 
        ON messages (sender_id);
      `);
      console.log('✅ Index idx_messages_sender_id created successfully');

      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_messages_status 
        ON messages (status);
      `);
      console.log('✅ Index idx_messages_status created successfully');

      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_chats_last_activity 
        ON chats (last_activity);
      `);
      console.log('✅ Index idx_chats_last_activity created successfully');

      console.log('✅ All tables and indexes created successfully');
    } catch (error) {
      console.error('❌ Failed to create tables:', error);
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to create database tables',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get database instance (for advanced queries if needed)
   */
  static getDatabase(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }
    console.log('✅ Database instance retrieved successfully');
    return this.db;
  }

  /**
   * Close database connection
   */
  static async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      console.log('✅ Database connection closed successfully');
    }
  }

  /**
   * Clear all data (useful for logout/reset)
   */
  static async clearAllData(): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      await this.db.execAsync('DELETE FROM messages;');
      console.log('✅ All messages deleted successfully');
      
      await this.db.execAsync('DELETE FROM chats;');
      console.log('✅ All chats deleted successfully');
      
      console.log('✅ All data cleared from local database successfully');
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to clear database',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get database statistics
   */
  static async getStats(): Promise<{ chats: number; messages: number }> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      const chatCount = await this.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM chats;');
      const messageCount = await this.db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM messages;');

      const stats = {
        chats: chatCount?.count || 0,
        messages: messageCount?.count || 0,
      };

      console.log('✅ Database statistics retrieved successfully:', stats);
      return stats;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get database statistics',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // =====================================
  // CHAT OPERATIONS
  // =====================================

  /**
   * Insert or update a chat
   */
  static async upsertChat(chat: Chat): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      await this.db.runAsync(`
        INSERT OR REPLACE INTO chats (
          id, participants, participant_details, last_message_content,
          last_message_sender_id, last_message_sender_username, last_message_timestamp,
          last_message_type, last_message_is_encrypted, last_activity, created_at,
          created_by, unread_count, is_active, is_secret_chat, encryption_enabled,
          session_keys
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        chat.id,
        JSON.stringify(chat.participants),
        JSON.stringify(chat.participantDetails),
        chat.lastMessage?.content || null,
        chat.lastMessage?.senderId || null,
        chat.lastMessage?.senderUsername || null,
        chat.lastMessage?.timestamp || null,
        chat.lastMessage?.type || 'text',
        chat.lastMessage?.isEncrypted ? 1 : 0,
        chat.lastActivity,
        chat.createdAt,
        chat.createdBy,
        JSON.stringify(chat.unreadCount),
        chat.isActive ? 1 : 0,
        chat.isSecretChat ? 1 : 0,
        chat.encryptionEnabled ? 1 : 0,
        chat.sessionKeys ? JSON.stringify(chat.sessionKeys) : null,
      ]);
      
      console.log('✅ Chat upserted successfully:', { 
        chatId: chat.id, 
        participants: chat.participants.length,
        isSecretChat: chat.isSecretChat,
        encryptionEnabled: chat.encryptionEnabled 
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to upsert chat',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get all chats for a user, ordered by last activity
   */
  static async getUserChats(userId: string): Promise<LocalChatListItem[]> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      const rows = await this.db.getAllAsync<any>(`
        SELECT * FROM chats 
        WHERE participants LIKE '%"' || ? || '"%'
        ORDER BY last_activity DESC
      `, [userId]);

      const chatItems: LocalChatListItem[] = [];

      for (const row of rows) {
        const participants: string[] = JSON.parse(row.participants);
        const participantDetails: ChatParticipant[] = JSON.parse(row.participant_details);
        const unreadCount: { [key: string]: number } = JSON.parse(row.unread_count);

        // Find the other participant
        const otherParticipantId = participants.find(p => p !== userId);
        const otherParticipant = participantDetails.find(p => p.uid === otherParticipantId);

        if (!otherParticipant) continue;

        const chat: Chat = {
          id: row.id,
          participants,
          participantDetails,
          lastActivity: row.last_activity,
          createdAt: row.created_at,
          createdBy: row.created_by,
          unreadCount,
          isActive: row.is_active === 1,
          isSecretChat: row.is_secret_chat === 1,
          encryptionEnabled: row.encryption_enabled === 1,
          ...(row.session_keys && { sessionKeys: JSON.parse(row.session_keys) }),
          ...(row.last_message_content && {
            lastMessage: {
              content: row.last_message_content,
              senderId: row.last_message_sender_id,
              senderUsername: row.last_message_sender_username,
              timestamp: row.last_message_timestamp,
              type: row.last_message_type as MessageType,
              isEncrypted: row.last_message_is_encrypted === 1,
            },
          }),
        };

        chatItems.push({
          chat,
          otherParticipant: {
            uid: otherParticipant.uid,
            username: otherParticipant.username,
            displayName: otherParticipant.displayName,
            profilePicture: otherParticipant.profilePicture,
          },
          unreadCount: unreadCount[userId] || 0,
          lastMessage: chat.lastMessage ? {
            content: chat.lastMessage.content,
            senderId: chat.lastMessage.senderId,
            senderUsername: chat.lastMessage.senderUsername,
            timestamp: chat.lastMessage.timestamp,
            isOwnMessage: chat.lastMessage.senderId === userId,
            isEncrypted: chat.lastMessage.isEncrypted,
          } : undefined,
        });
      }

      console.log('✅ User chats retrieved successfully:', { 
        userId, 
        chatCount: chatItems.length,
        totalUnread: chatItems.reduce((sum, item) => sum + item.unreadCount, 0)
      });
      
      return chatItems;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get user chats',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get a specific chat by ID
   */
  static async getChatById(chatId: string): Promise<Chat | null> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      const row = await this.db.getFirstAsync<any>('SELECT * FROM chats WHERE id = ?', [chatId]);

      if (!row) {
        console.log('ℹ️ Chat not found:', { chatId });
        return null;
      }

      const participants: string[] = JSON.parse(row.participants);
      const participantDetails: ChatParticipant[] = JSON.parse(row.participant_details);
      const unreadCount: { [key: string]: number } = JSON.parse(row.unread_count);

      const chat: Chat = {
        id: row.id,
        participants,
        participantDetails,
        lastActivity: row.last_activity,
        createdAt: row.created_at,
        createdBy: row.created_by,
        unreadCount,
        isActive: row.is_active === 1,
        isSecretChat: row.is_secret_chat === 1,
        encryptionEnabled: row.encryption_enabled === 1,
        ...(row.session_keys && { sessionKeys: JSON.parse(row.session_keys) }),
        ...(row.last_message_content && {
          lastMessage: {
            content: row.last_message_content,
            senderId: row.last_message_sender_id,
            senderUsername: row.last_message_sender_username,
            timestamp: row.last_message_timestamp,
            type: row.last_message_type as MessageType,
            isEncrypted: row.last_message_is_encrypted === 1,
          },
        }),
      };

      console.log('✅ Chat retrieved successfully:', { 
        chatId: chat.id,
        participants: chat.participants.length,
        hasLastMessage: !!chat.lastMessage,
        isSecretChat: chat.isSecretChat
      });

      return chat;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get chat by ID',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Update chat's last message
   */
  static async updateChatLastMessage(
    chatId: string,
    content: string,
    senderId: string,
    senderUsername: string,
    timestamp: string,
    type: MessageType = 'text',
    isEncrypted: boolean = false
  ): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      await this.db.runAsync(`
        UPDATE chats SET 
          last_message_content = ?,
          last_message_sender_id = ?,
          last_message_sender_username = ?,
          last_message_timestamp = ?,
          last_message_type = ?,
          last_message_is_encrypted = ?,
          last_activity = ?
        WHERE id = ?
      `, [content, senderId, senderUsername, timestamp, type, isEncrypted ? 1 : 0, timestamp, chatId]);
      
      console.log('✅ Chat last message updated successfully:', { 
        chatId, 
        senderId, 
        senderUsername,
        messageType: type,
        isEncrypted,
        contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : '')
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update chat last message',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Update unread count for a user in a chat
   */
  static async updateUnreadCount(chatId: string, userId: string, count: number): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      // Get current unread count
      const row = await this.db.getFirstAsync<{ unread_count: string }>('SELECT unread_count FROM chats WHERE id = ?', [chatId]);
      
      if (row) {
        const unreadCount = JSON.parse(row.unread_count);
        const previousCount = unreadCount[userId] || 0;
        unreadCount[userId] = count;
        
        await this.db.runAsync('UPDATE chats SET unread_count = ? WHERE id = ?', [JSON.stringify(unreadCount), chatId]);
        
        console.log('✅ Unread count updated successfully:', { 
          chatId, 
          userId, 
          previousCount, 
          newCount: count 
        });
      }
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update unread count',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // =====================================
  // MESSAGE OPERATIONS
  // =====================================

  /**
   * Insert a new message
   */
  static async insertMessage(message: Message): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      await this.db.runAsync(`
        INSERT OR REPLACE INTO messages (
          id, chat_id, sender_id, sender_username, sender_display_name,
          sender_profile_picture, content, type, timestamp, status, read_by,
          is_edited, edited_at, is_encrypted, encrypted_content, deleted_at,
          image_uri, image_download_url, image_width, image_height, image_size,
          video_uri, video_download_url, video_thumbnail_url, video_duration,
          video_width, video_height, video_size, reply_to_message_id,
          reply_to_content, reply_to_sender_username
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        message.id,
        message.chatId,
        message.senderId,
        message.senderUsername,
        (message as any).senderDisplayName || null,
        (message as any).senderProfilePicture || null,
        message.content || null,
        message.type,
        message.timestamp,
        message.status,
        message.readBy ? JSON.stringify(message.readBy) : null,
        message.isEdited ? 1 : 0,
        message.editedAt || null,
        message.isEncrypted ? 1 : 0,
        message.encryptedContent || null,
        (message as any).deletedAt || null,
        message.imageData?.uri || null,
        message.imageData?.downloadURL || null,
        message.imageData?.width || null,
        message.imageData?.height || null,
        message.imageData?.size || null,
        message.videoData?.uri || null,
        message.videoData?.downloadURL || null,
        message.videoData?.thumbnailURL || null,
        message.videoData?.duration || null,
        message.videoData?.width || null,
        message.videoData?.height || null,
        message.videoData?.size || null,
        message.replyTo?.messageId || null,
        message.replyTo?.content || null,
        message.replyTo?.senderUsername || null,
      ]);
      
      console.log('✅ Message inserted successfully:', { 
        messageId: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        senderUsername: message.senderUsername,
        type: message.type,
        status: message.status,
        isEncrypted: message.isEncrypted,
        hasImageData: !!message.imageData,
        hasVideoData: !!message.videoData,
        isReply: !!message.replyTo,
        contentPreview: message.content?.substring(0, 50) + (message.content && message.content.length > 50 ? '...' : '')
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to insert message',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Get messages for a chat with pagination
   */
  static async getChatMessages(
    chatId: string,
    limit: number = 25,
    offset: number = 0
  ): Promise<Message[]> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      const rows = await this.db.getAllAsync<any>(`
        SELECT * FROM messages 
        WHERE chat_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ? OFFSET ?
      `, [chatId, limit, offset]);

      const messages = rows.map(row => this.mapRowToMessage(row)).reverse();
      
      console.log('✅ Chat messages retrieved successfully:', { 
        chatId,
        messageCount: messages.length,
        limit,
        offset,
        hasMoreMessages: messages.length === limit
      });
      
      return messages;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get chat messages',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Update message status
   */
  static async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      await this.db.runAsync('UPDATE messages SET status = ? WHERE id = ?', [status, messageId]);
      
      console.log('✅ Message status updated successfully:', { 
        messageId, 
        newStatus: status 
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update message status',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  static async updateMessageId(oldMessageId: string, newMessageId: string): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }
    
    try {
      await this.db.runAsync('UPDATE messages SET id = ? WHERE id = ?', [newMessageId, oldMessageId]);
      
      console.log('✅ Message ID updated successfully:', { 
        oldMessageId, 
        newMessageId 
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update message ID',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Mark message as read by adding user to readBy array
   */
  static async markMessageAsRead(messageId: string, userId: string): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      const row = await this.db.getFirstAsync<{ read_by: string | null }>('SELECT read_by FROM messages WHERE id = ?', [messageId]);
      
      if (row) {
        const readBy = row.read_by ? JSON.parse(row.read_by) : [];
        const wasAlreadyRead = readBy.includes(userId);
        
        if (!wasAlreadyRead) {
          readBy.push(userId);
          await this.db.runAsync('UPDATE messages SET read_by = ?, status = ? WHERE id = ?', [JSON.stringify(readBy), 'read', messageId]);
          
          console.log('✅ Message marked as read successfully:', { 
            messageId, 
            userId, 
            totalReadBy: readBy.length 
          });
        } else {
          console.log('ℹ️ Message already marked as read by user:', { messageId, userId });
        }
      }
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to mark message as read',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Delete a message (soft delete)
   */
  static async deleteMessage(messageId: string): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      await this.db.runAsync(`
        UPDATE messages SET 
          content = 'This message was deleted',
          status = 'deleted',
          deleted_at = ?,
          is_encrypted = 0,
          encrypted_content = NULL,
          image_uri = NULL,
          image_download_url = NULL,
          video_uri = NULL,
          video_download_url = NULL
        WHERE id = ?
      `, [new Date().toISOString(), messageId]);
      
      console.log('✅ Message deleted successfully:', { 
        messageId, 
        deletedAt: new Date().toISOString() 
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to delete message',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Edit a message
   */
  static async editMessage(messageId: string, newContent: string, isEncrypted: boolean = false, encryptedContent?: string): Promise<void> {
    if (!this.db) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      await this.db.runAsync(`
        UPDATE messages SET 
          content = ?,
          is_edited = 1,
          edited_at = ?,
          is_encrypted = ?,
          encrypted_content = ?
        WHERE id = ?
      `, [newContent, new Date().toISOString(), isEncrypted ? 1 : 0, encryptedContent || null, messageId]);
      
      console.log('✅ Message edited successfully:', { 
        messageId, 
        isEncrypted,
        editedAt: new Date().toISOString(),
        contentPreview: newContent.substring(0, 50) + (newContent.length > 50 ? '...' : '')
      });
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to edit message',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  // =====================================
  // HELPER METHODS
  // =====================================

  /**
   * Convert database row to Message object
   */
  private static mapRowToMessage(row: any): Message {
    const message: Message = {
      id: row.id,
      chatId: row.chat_id,
      senderId: row.sender_id,
      senderUsername: row.sender_username,
      content: row.content,
      type: row.type as MessageType,
      timestamp: row.timestamp,
      status: row.status as MessageStatus,
      ...(row.read_by && { readBy: JSON.parse(row.read_by) }),
      ...(row.is_edited === 1 && { isEdited: true }),
      ...(row.edited_at && { editedAt: row.edited_at }),
      ...(row.is_encrypted === 1 && { isEncrypted: true }),
      ...(row.encrypted_content && { encryptedContent: row.encrypted_content }),
    };

    // Add sender details if available
    if (row.sender_display_name) {
      (message as any).senderDisplayName = row.sender_display_name;
    }
    if (row.sender_profile_picture) {
      (message as any).senderProfilePicture = row.sender_profile_picture;
    }

    // Add image data if available
    if (row.image_uri) {
      message.imageData = {
        uri: row.image_uri,
        downloadURL: row.image_download_url,
        width: row.image_width,
        height: row.image_height,
        size: row.image_size,
      };
    }

    // Add video data if available
    if (row.video_uri) {
      message.videoData = {
        uri: row.video_uri,
        downloadURL: row.video_download_url,
        thumbnailURL: row.video_thumbnail_url,
        duration: row.video_duration,
        width: row.video_width,
        height: row.video_height,
        size: row.video_size,
      };
    }

    // Add reply data if available
    if (row.reply_to_message_id) {
      message.replyTo = {
        messageId: row.reply_to_message_id,
        content: row.reply_to_content,
        senderUsername: row.reply_to_sender_username,
      };
    }

    return message;
  }
}