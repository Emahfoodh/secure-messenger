// services/databaseService.ts

import * as SQLite from 'expo-sqlite';
import { AppError, ErrorType } from '@/services/errorService';
import { Message } from '@/types/messageTypes';

export interface LocalMessage {
  id: string; // Can be temp_${timestamp} or actual Firebase ID
  chatId: string;
  senderId: string; // Keep senderId to know who sent it
  content: string;
  type: 'text' | 'image' | 'video' | 'file' | 'deleted';
  timestamp: string;
  status: 'sending' | 'sent' | 'read';
  readBy?: string[]; // Array of user IDs who have read this message
  editedAt?: string;
  // Encryption support
  isEncrypted?: boolean;
  encryptedContent?: string;
  // Media data
  imageData?: any; // Will store as JSON
  videoData?: any; // Will store as JSON
  replyTo?: any; // Will store as JSON
}

export class DatabaseService {
  private static database: SQLite.SQLiteDatabase | null = null;
  private static readonly DB_NAME = 'secure_messenger.db';
  private static readonly DB_VERSION = 1;

  /**
   * Initialize the database and create tables
   */
  static async initialize(): Promise<void> {
    try {
      this.database = await SQLite.openDatabaseAsync(this.DB_NAME);
      
      // Check if we need to recreate tables (for development)
      //   await this.ensureFreshSchema();
      
      await this.createTables();
      console.log('✅ Database initialized successfully');
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to initialize database',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Ensure we have a fresh schema (for development)
   */
  private static async ensureFreshSchema(): Promise<void> {
    if (!this.database) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    try {
      // Drop existing table and indexes if they exist (for clean slate)
      await this.database.execAsync('DROP TABLE IF EXISTS messages;');
      await this.database.execAsync('DROP INDEX IF EXISTS idx_messages_chatId;');
      await this.database.execAsync('DROP INDEX IF EXISTS idx_messages_timestamp;');
      await this.database.execAsync('DROP INDEX IF EXISTS idx_messages_senderId;');
      
      console.log('🔄 Cleaned up existing database schema');
    } catch (error) {
      // Ignore errors if tables/indexes don't exist
      console.log('ℹ️ No existing schema to clean up');
    }
  }

  /**
   * Create the messages table with exact Firebase structure
   */
  private static async createTables(): Promise<void> {
    if (!this.database) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized');
    }

    // Create messages table
    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chatId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sending',
        readBy TEXT,
        editedAt TEXT,
        isEncrypted INTEGER DEFAULT 0,
        encryptedContent TEXT,
        imageData TEXT,
        videoData TEXT,
        replyTo TEXT
      );
    `;

    // Create indexes for faster queries
    const createIndexes = [
      `CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId);`,
      `CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);`,
      `CREATE INDEX IF NOT EXISTS idx_messages_senderId ON messages(senderId);`
    ];

    await this.database.execAsync(createMessagesTable);
    
    // Create indexes separately
    for (const indexQuery of createIndexes) {
      await this.database.execAsync(indexQuery);
    }
  }

  /**
   * Get database instance
   */
  private static getDatabase(): SQLite.SQLiteDatabase {
    if (!this.database) {
      throw new AppError(ErrorType.STORAGE, 'Database not initialized. Call initialize() first.');
    }
    return this.database;
  }

  /**
   * Insert a new message into local storage
   */
  static async insertMessage(message: LocalMessage): Promise<void> {
    try {
      const db = this.getDatabase();
      
      const query = `
        INSERT INTO messages (
          id, chatId, senderId, content, type, timestamp, status, 
          readBy, editedAt, isEncrypted, encryptedContent, imageData, 
          videoData, replyTo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await db.runAsync(query, [
        message.id,
        message.chatId,
        message.senderId,
        message.content,
        message.type,
        message.timestamp,
        message.status,
        message.readBy ? JSON.stringify(message.readBy) : null,
        message.editedAt || null,
        message.isEncrypted ? 1 : 0,
        message.encryptedContent || null,
        message.imageData ? JSON.stringify(message.imageData) : null,
        message.videoData ? JSON.stringify(message.videoData) : null,
        message.replyTo ? JSON.stringify(message.replyTo) : null,
      ]);

      console.log(`✅ Message inserted locally: ${message.id}`);
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to insert message',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Update message ID after successful Firebase upload
   */
  static async updateMessageId(tempId: string, firebaseId: string): Promise<void> {
    try {
      const db = this.getDatabase();
      
      const query = `UPDATE messages SET id = ? WHERE id = ?`;
      await db.runAsync(query, [firebaseId, tempId]);
      
      console.log(`✅ Message ID updated: ${tempId} → ${firebaseId}`);
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update message ID',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Update message status
   */
  static async updateMessageStatus(messageId: string, status: 'sending' | 'sent' | 'read'): Promise<void> {
    try {
      const db = this.getDatabase();
      
      const query = `UPDATE messages SET status = ? WHERE id = ?`;
      await db.runAsync(query, [status, messageId]);
      
      console.log(`✅ Message status updated: ${messageId} → ${status}`);
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to update message status',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Get messages for a specific chat (for rendering)
   */
  static async getMessagesForChat(chatId: string, limit: number = 50): Promise<LocalMessage[]> {
    try {
      const db = this.getDatabase();
      
      const query = `
        SELECT * FROM messages 
        WHERE chatId = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `;
      
      const result = await db.getAllAsync(query, [chatId, limit]) as any[];
      
      // Convert SQLite rows back to LocalMessage objects
      const messages: LocalMessage[] = result.map(row => ({
        id: row.id,
        chatId: row.chatId,
        senderId: row.senderId,
        content: row.content,
        type: row.type,
        timestamp: row.timestamp,
        status: row.status,
        readBy: row.readBy ? JSON.parse(row.readBy) : undefined,
        editedAt: row.editedAt,
        isEncrypted: row.isEncrypted === 1,
        encryptedContent: row.encryptedContent,
        imageData: row.imageData ? JSON.parse(row.imageData) : undefined,
        videoData: row.videoData ? JSON.parse(row.videoData) : undefined,
        replyTo: row.replyTo ? JSON.parse(row.replyTo) : undefined,
      }));

      // Return in chronological order (oldest first)
      return messages.reverse();
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get messages for chat',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Generate temporary message ID
   */
  static generateTempMessageId(): string {
    return `temp_${Date.now()}`;
  }

  /**
   * Check if a message exists by ID
   */
  static async messageExists(messageId: string): Promise<boolean> {
    try {
      const db = this.getDatabase();
      
      const query = `SELECT 1 FROM messages WHERE id = ? LIMIT 1`;
      const result = await db.getFirstAsync(query, [messageId]);
      
      return result !== null;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to check message existence',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Get the latest message timestamp for a chat (for sync)
   */
  static async getLatestMessageTimestamp(chatId: string): Promise<string | null> {
    try {
      const db = this.getDatabase();
      
      const query = `
        SELECT timestamp FROM messages 
        WHERE chatId = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
      `;
      
      const result = await db.getFirstAsync(query, [chatId]) as { timestamp: string } | null;
      return result?.timestamp || null;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to get latest message timestamp',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Close database connection
   */
  static async close(): Promise<void> {
    if (this.database) {
      await this.database.closeAsync();
      this.database = null;
      console.log('✅ Database connection closed');
    }
  }
}