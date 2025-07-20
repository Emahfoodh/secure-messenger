// services/encryptionService.ts

import { AppError, ErrorType } from '@/services/errorService';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';

/**
 * Expo Go Compatible Encryption Service for Phase 4
 * 
 * This implements symmetric encryption using:
 * - expo-crypto for secure random number generation
 * - aes-js for pure JavaScript AES-256-CBC encryption
 * 
 * Fully compatible with Expo Go - no native crypto dependencies
 */
export class EncryptionService {
  
  /**
   * Generate a shared encryption key for a chat
   * For Phase 4: We create a deterministic key based on both user IDs
   * For Phase 5: We'll use proper key exchange protocols
   */
  static generateChatKey(userId1: string, userId2: string): string {
    try {
      // Create a deterministic key by combining and sorting user IDs
      const sortedIds = [userId1, userId2].sort();
      const combinedIds = sortedIds.join('_');
      
      // Generate a consistent key using SHA256 (returns hex string)
      // We'll convert this to proper 32-byte key for AES-256
      const keyHex = Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        combinedIds + 'secure_messenger_key'
      );
      
      // Since digestStringAsync is async, we need a sync version
      // For deterministic key generation, we'll use a different approach
      return this.generateDeterministicKey(combinedIds);
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to generate chat encryption key',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Generate a deterministic key synchronously
   * Uses a simple hash-based approach for consistent key generation
   */
  private static generateDeterministicKey(input: string): string {
    try {
      // Simple deterministic key generation
      // In production, consider using a proper PBKDF2 implementation
      let hash = 0;
      const fullInput = input + 'secure_messenger_key';
      
      // Generate 32 bytes (256 bits) for AES-256
      const keyBytes = new Uint8Array(32);
      
      for (let i = 0; i < 32; i++) {
        for (let j = 0; j < fullInput.length; j++) {
          hash = ((hash << 5) - hash + fullInput.charCodeAt(j) + i) & 0xffffffff;
        }
        keyBytes[i] = Math.abs(hash) % 256;
      }
      
      // Convert to hex string for consistency with original API
      return aesjs.utils.hex.fromBytes(keyBytes);
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to generate deterministic key',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Encrypt a message
   * 
   * @param message - The plain text message to encrypt
   * @param chatKey - The encryption key for this chat (hex string)
   * @returns Encrypted message string (hex format with IV prepended)
   */
  static encryptMessage(message: string, chatKey: string): string {
    try {
      if (!message || !chatKey) {
        throw new AppError(
          ErrorType.VALIDATION,
          'Message and chat key are required for encryption'
        );
      }

      // Convert hex key to bytes (32 bytes for AES-256)
      const keyBytes = aesjs.utils.hex.toBytes(chatKey);
      if (keyBytes.length !== 32) {
        throw new AppError(
          ErrorType.VALIDATION,
          'Invalid key length - must be 256 bits (32 bytes)'
        );
      }

      // Generate random IV (16 bytes for AES)
      const iv = Crypto.getRandomBytes(16);
      
      // Convert message to bytes
      const messageBytes = aesjs.utils.utf8.toBytes(message);
      
      // Pad message to multiple of 16 bytes (PKCS7 padding)
      const paddedMessageBytes = this.addPKCS7Padding(messageBytes);
      
      // Create AES-CBC cipher
      const aesCbc = new aesjs.ModeOfOperation.cbc(keyBytes, iv);
      
      // Encrypt the message
      const encryptedBytes = aesCbc.encrypt(paddedMessageBytes);
      
      // Combine IV + encrypted data
      const combined = new Uint8Array(iv.length + encryptedBytes.length);
      combined.set(iv, 0);
      combined.set(encryptedBytes, iv.length);
      
      // Convert to hex string
      const encryptedHex = aesjs.utils.hex.fromBytes(combined);
      
      if (!encryptedHex) {
        throw new AppError(
          ErrorType.ENCRYPTION,
          'Failed to encrypt message'
        );
      }

      return encryptedHex;
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Encryption failed',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Decrypt a message
   * 
   * @param encryptedMessage - The encrypted message to decrypt (hex format with IV prepended)
   * @param chatKey - The encryption key for this chat (hex string)
   * @returns Decrypted plain text message
   */
  static decryptMessage(encryptedMessage: string, chatKey: string): string {
    try {
      if (!encryptedMessage || !chatKey) {
        throw new AppError(
          ErrorType.VALIDATION,
          'Encrypted message and chat key are required for decryption'
        );
      }

      // Convert hex key to bytes
      const keyBytes = aesjs.utils.hex.toBytes(chatKey);
      if (keyBytes.length !== 32) {
        throw new AppError(
          ErrorType.VALIDATION,
          'Invalid key length - must be 256 bits (32 bytes)'
        );
      }

      // Convert encrypted message from hex to bytes
      const combinedBytes = aesjs.utils.hex.toBytes(encryptedMessage);
      
      if (combinedBytes.length < 16) {
        throw new AppError(
          ErrorType.VALIDATION,
          'Invalid encrypted message - too short'
        );
      }

      // Extract IV (first 16 bytes) and encrypted data
      const iv = combinedBytes.slice(0, 16);
      const encryptedBytes = combinedBytes.slice(16);

      // Create AES-CBC cipher
      const aesCbc = new aesjs.ModeOfOperation.cbc(keyBytes, iv);
      
      // Decrypt the message
      const decryptedBytes = aesCbc.decrypt(encryptedBytes);
      
      // Remove PKCS7 padding
      const unpaddedBytes = this.removePKCS7Padding(decryptedBytes);
      
      // Convert bytes back to string
      const decryptedMessage = aesjs.utils.utf8.fromBytes(unpaddedBytes);
      
      if (!decryptedMessage && unpaddedBytes.length > 0) {
        throw new AppError(
          ErrorType.ENCRYPTION,
          'Failed to decrypt message - invalid key or corrupted data'
        );
      }

      return decryptedMessage;
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Decryption failed',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Add PKCS7 padding to data
   * AES-CBC requires data to be multiple of 16 bytes
   */
  private static addPKCS7Padding(data: Uint8Array): Uint8Array {
    const blockSize = 16;
    const padding = blockSize - (data.length % blockSize);
    const padded = new Uint8Array(data.length + padding);
    
    padded.set(data, 0);
    
    // Fill padding bytes with the padding value
    for (let i = data.length; i < padded.length; i++) {
      padded[i] = padding;
    }
    
    return padded;
  }

  /**
   * Remove PKCS7 padding from data
   */
  private static removePKCS7Padding(data: Uint8Array): Uint8Array {
    if (data.length === 0) {
      return data;
    }
    
    const paddingLength = data[data.length - 1];
    
    // Validate padding
    if (paddingLength < 1 || paddingLength > 16) {
      throw new AppError(
        ErrorType.VALIDATION,
        'Invalid PKCS7 padding'
      );
    }
    
    // Check if all padding bytes are correct
    for (let i = data.length - paddingLength; i < data.length; i++) {
      if (data[i] !== paddingLength) {
        throw new AppError(
          ErrorType.VALIDATION,
          'Invalid PKCS7 padding'
        );
      }
    }
    
    return data.slice(0, data.length - paddingLength);
  }

  /**
   * Check if a message is encrypted
   * Improved detection for our new format
   */
  static isMessageEncrypted(message: string): boolean {
    try {
      // Our encrypted messages are hex strings with IV (32 chars) + encrypted data
      // Minimum length: 32 (IV) + 32 (one block) = 64 hex characters
      if (message.length < 64) {
        return false;
      }
      
      // Check if it's a valid hex string
      if (!/^[a-fA-F0-9]+$/.test(message)) {
        return false;
      }
      
      // Length should be even (hex encoding)
      if (message.length % 2 !== 0) {
        return false;
      }
      
      // Length should account for IV (16 bytes = 32 hex chars) + encrypted blocks (multiples of 16 bytes)
      const dataLength = (message.length - 32) / 2; // Subtract IV, convert hex to bytes
      return dataLength > 0 && dataLength % 16 === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Encrypt media metadata (file names, sizes, etc.)
   * For Phase 4: We'll encrypt basic metadata
   */
  static encryptMetadata(metadata: any, chatKey: string): string {
    try {
      const metadataString = JSON.stringify(metadata);
      return this.encryptMessage(metadataString, chatKey);
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to encrypt metadata',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Decrypt media metadata
   */
  static decryptMetadata(encryptedMetadata: string, chatKey: string): any {
    try {
      const decryptedString = this.decryptMessage(encryptedMetadata, chatKey);
      return JSON.parse(decryptedString);
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to decrypt metadata',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Generate a random salt for additional security
   * Now using expo-crypto for secure randomness
   */
  static generateSalt(): string {
    try {
      const saltBytes = Crypto.getRandomBytes(16);
      return aesjs.utils.hex.fromBytes(saltBytes);
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to generate salt',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Derive a key from a password (for future use)
   * Basic implementation - in Phase 5 we'll use proper PBKDF2
   */
  static deriveKeyFromPassword(password: string, salt: string): string {
    try {
      const saltBytes = aesjs.utils.hex.toBytes(salt);
      const combined = password + aesjs.utils.hex.fromBytes(saltBytes);
      
      // Simple key derivation - in production use proper PBKDF2
      return this.generateDeterministicKey(combined);
    } catch (error: any) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to derive key from password',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }
}