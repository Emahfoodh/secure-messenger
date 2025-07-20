// services/keyManagementService.ts

import { AppError, ErrorType } from '@/services/errorService';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { box } from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

/**
 * Service for managing cryptographic keys and secure storage
 * Handles:
 * - User keypair generation and storage
 * - Chat session key generation and exchange
 * - Secure key storage
 */
export class KeyManagementService {
  // Storage keys
  private static readonly USER_PRIVATE_KEY = 'user_private_key';
  private static readonly USER_PUBLIC_KEY = 'user_public_key';
  
  /**
   * Generate secure random bytes using expo-crypto
   */
  private static getRandomBytes(length: number): Uint8Array {
    return Crypto.getRandomBytes(length);
  }

  /**
   * Generate a new keypair for a user
   * Returns: { publicKey: string, privateKey: string } (Base64 encoded)
   */
  static async generateUserKeyPair(): Promise<{ publicKey: string, privateKey: string }> {
    try {
      // Initialize random seed for TweetNaCl
      const seed = this.getRandomBytes(32);
      const keyPair = box.keyPair.fromSecretKey(seed);
      
      // Encode keys to Base64 for storage
      const publicKey = encodeBase64(keyPair.publicKey);
      const privateKey = encodeBase64(keyPair.secretKey);
      
      // Store keys securely
      await this.storePrivateKey(privateKey);
      await this.storePublicKey(publicKey);
      
      return {
        publicKey,
        privateKey
      };
    } catch (error) {
      if (error instanceof AppError) {
        console.error('Key generation error:', error);
        throw error;
      }
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to generate user keypair',
        error
      );
    }
  }

  /**
   * Store private key in secure storage
   * The key is stored in the device's secure enclave (iOS Keychain/Android Keystore)
   */
  private static async storePrivateKey(privateKey: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        this.USER_PRIVATE_KEY,
        privateKey
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to store private key',
        error
      );
    }
  }

  /**
   * Store public key in secure storage
   * While public keys don't need to be secret, we store them securely
   * to prevent tampering
   */
  private static async storePublicKey(publicKey: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(
        this.USER_PUBLIC_KEY,
        publicKey
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to store public key',
        error
      );
    }
  }

  /**
   * Verify if the private key exists in secure storage
   * Returns true if key exists, false otherwise
   */
  static async verifyPrivateKeyExists(): Promise<boolean> {
    try {
      const privateKey = await SecureStore.getItemAsync(this.USER_PRIVATE_KEY);
      return privateKey !== null;
    } catch (error) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to verify private key existence',
        error
      );
    }
  }

  /**
   * Retrieve the user's private key from secure storage
   */
  static async getPrivateKey(): Promise<string | undefined> {
    try {
      const key = await SecureStore.getItemAsync(this.USER_PRIVATE_KEY);
      return key || undefined;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to retrieve private key',
        error
      );
    }
  }

  /**
   * Retrieve the user's public key from secure storage
   */
  static async getPublicKey(): Promise<string | undefined> {
    try {
      const key = await SecureStore.getItemAsync(this.USER_PUBLIC_KEY);
      return key || undefined;
    } catch (error) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to retrieve public key',
        error
      );
    }
  }

  /**
   * Generate a shared secret key for a chat using both users' keys
   * Uses X25519 key exchange (implemented in TweetNaCl's box)
   */
  static async generateSharedSecret(
    theirPublicKey: string,
    ourPrivateKey?: string
  ): Promise<string> {
    try {
      // If private key not provided, get from storage
      if (!ourPrivateKey) {
        const storedKey = await this.getPrivateKey();
        if (!storedKey) {
          throw new AppError(
            ErrorType.ENCRYPTION,
            'Private key not found'
          );
        }
        ourPrivateKey = storedKey;
      }

      // Decode keys from Base64
      const publicKeyBytes = decodeBase64(theirPublicKey);
      const privateKeyBytes = decodeBase64(ourPrivateKey);

      // Generate shared secret
      const sharedKey = box.before(publicKeyBytes, privateKeyBytes);
      
      // Return Base64 encoded shared secret
      return encodeBase64(sharedKey);
    } catch (error) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to generate shared secret',
        error
      );
    }
  }

  /**
   * Generate a random chat session key
   * This is used for symmetric encryption of chat messages
   */
  static generateSessionKey(): string {
    try {
      const sessionKey = this.getRandomBytes(32);
      return encodeBase64(sessionKey);
    } catch (error) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to generate session key',
        error
      );
    }
  }

  /**
   * Encrypt a session key with a recipient's public key
   */
  static async encryptSessionKey(
    sessionKey: string,
    recipientPublicKey: string
  ): Promise<string> {
    try {
      const ourPrivateKey = await this.getPrivateKey();
      if (!ourPrivateKey) {
        throw new AppError(
          ErrorType.ENCRYPTION,
          'Private key not found'
        );
      }

      // Decode keys
      const privateKeyBytes = decodeBase64(ourPrivateKey);
      const publicKeyBytes = decodeBase64(recipientPublicKey);
      const sessionKeyBytes = decodeBase64(sessionKey);

      // Generate one-time nonce using our secure random generator
      const nonce = this.getRandomBytes(box.nonceLength);

      // Encrypt session key
      const encryptedKey = box(
        sessionKeyBytes,
        nonce,
        publicKeyBytes,
        privateKeyBytes
      );

      // Combine nonce and encrypted key
      const combined = new Uint8Array(nonce.length + encryptedKey.length);
      combined.set(nonce);
      combined.set(encryptedKey, nonce.length);

      // Return as Base64
      return encodeBase64(combined);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to encrypt session key',
        error
      );
    }
  }

  /**
   * Decrypt a session key that was encrypted with our public key
   */
  static async decryptSessionKey(
    encryptedKey: string,
    senderPublicKey: string
  ): Promise<string> {
    try {
      const ourPrivateKey = await this.getPrivateKey();
      if (!ourPrivateKey) {
        throw new AppError(
          ErrorType.ENCRYPTION,
          'Private key not found'
        );
      }

      // Decode keys
      const combined = decodeBase64(encryptedKey);
      const privateKeyBytes = decodeBase64(ourPrivateKey);
      const publicKeyBytes = decodeBase64(senderPublicKey);

      // Extract nonce and encrypted key
      const nonce = combined.slice(0, box.nonceLength);
      const encryptedKeyBytes = combined.slice(box.nonceLength);

      // Decrypt session key
      const decryptedKey = box.open(
        encryptedKeyBytes,
        nonce,
        publicKeyBytes,
        privateKeyBytes
      );

      if (!decryptedKey) {
        throw new AppError(
          ErrorType.ENCRYPTION,
          'Failed to decrypt session key - invalid key or corrupted data'
        );
      }

      // Return as Base64
      return encodeBase64(decryptedKey);
    } catch (error) {
      throw new AppError(
        ErrorType.ENCRYPTION,
        'Failed to decrypt session key',
        error
      );
    }
  }
} 