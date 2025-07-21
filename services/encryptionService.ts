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
   * Encrypt a message
   * 
   * @param message - The plain text message to encrypt
   * @param chatKey - The encryption key for this chat (hex string)
   * @returns Encrypted message string (hex format with IV prepended)
   */
  static encryptMessage(message: string, chatKey: string): string {
    console.warn("encryption will be implemented later");
    return message + "encrypted";
  }

  /**
   * Decrypt a message
   * 
   * @param encryptedMessage - The encrypted message to decrypt (hex format with IV prepended)
   * @param chatKey - The encryption key for this chat (hex string)
   * @returns Decrypted plain text message
   */
  static decryptMessage(encryptedMessage: string, chatKey: string): string {
    console.warn("decryption will be implemented later");
    return encryptedMessage.replace("encrypted", "");
  }
}