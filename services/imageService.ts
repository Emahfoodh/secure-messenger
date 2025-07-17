// services/imageService.ts

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebaseConfig';
import { AppError, ErrorType } from '@/services/errorService';

// Update message types to support images
export interface ImageData {
  uri: string;
  downloadURL: string;
  width: number;
  height: number;
  size: number;
}

export interface ImagePickerOptions {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  allowsMultipleSelection?: boolean;
}

export interface CompressedImageResult {
  uri: string;
  width: number;
  height: number;
  size: number; // in bytes
}

export class ImageService {
  // Maximum image dimensions for compression
  private static MAX_WIDTH = 1024;
  private static MAX_HEIGHT = 1024;
  private static COMPRESSION_QUALITY = 0.8;

  /**
   * Request camera permissions
   */
  static async requestCameraPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      throw new AppError(
        ErrorType.PERMISSION,
        'Failed to request camera permissions',
        error
      );
    }
  }

  /**
   * Request media library permissions
   */
  static async requestMediaLibraryPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      throw new AppError(
        ErrorType.PERMISSION,
        'Failed to request media library permissions',
        error
      );
    }
  }

  /**
   * Pick image from camer
   */
  static async pickImageFromCamera(options: ImagePickerOptions = {}): Promise<ImagePicker.ImagePickerAsset | null> {
    try {
      // Request permissions
      const hasPermission = await this.requestCameraPermissions();
      if (!hasPermission) {
        throw new AppError(
          ErrorType.PERMISSION,
          'Camera permission is required to take photos'
        );
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'], // FIXED: Use array instead of MediaTypeOptions.Images
        allowsEditing: false,
        aspect: options.aspect ?? [4, 3],
        quality: options.quality ?? 1,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0];
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to capture image from camera',
        error
      );
    }
  }

  /**
   * Pick image from gallery
   */
  static async pickImageFromGallery(options: ImagePickerOptions = {}): Promise<ImagePicker.ImagePickerAsset | null> {
    try {
      // Request permissions
      const hasPermission = await this.requestMediaLibraryPermissions();
      if (!hasPermission) {
        throw new AppError(
          ErrorType.PERMISSION,
          'Media library permission is required to select photos'
        );
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // FIXED: Use array instead of MediaTypeOptions.Images
        allowsEditing: false,
        aspect: options.aspect ?? [4, 3],
        quality: options.quality ?? 1,
        allowsMultipleSelection: options.allowsMultipleSelection ?? false,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0];
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to select image from gallery',
        error
      );
    }
  }

  /**
   * Compress and resize image for optimal chat performance
   */
  static async compressImage(
    imageUri: string,
    maxWidth: number = this.MAX_WIDTH,
    maxHeight: number = this.MAX_HEIGHT,
    quality: number = this.COMPRESSION_QUALITY
  ): Promise<CompressedImageResult> {
    try {
      // Get original image info
      const originalInfo = await FileSystem.getInfoAsync(imageUri);
      if (!originalInfo.exists) {
        throw new AppError(ErrorType.VALIDATION, 'Image file not found');
      }

      // Get image dimensions first
      const imageInfo = await ImageManipulator.manipulateAsync(imageUri, [], { 
        format: ImageManipulator.SaveFormat.JPEG 
      });

      const { width: originalWidth, height: originalHeight } = imageInfo;
      
      let newWidth = originalWidth;
      let newHeight = originalHeight;

      // Calculate new dimensions while maintaining aspect ratio
      if (originalWidth > maxWidth || originalHeight > maxHeight) {
        const widthRatio = maxWidth / originalWidth;
        const heightRatio = maxHeight / originalHeight;
        const ratio = Math.min(widthRatio, heightRatio);
        
        newWidth = Math.round(originalWidth * ratio);
        newHeight = Math.round(originalHeight * ratio);
      }

      // Resize and compress the image
      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: newWidth, height: newHeight } }],
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      // Get file size of compressed image
      const compressedInfo = await FileSystem.getInfoAsync(result.uri);
      const fileSize = compressedInfo.exists ? compressedInfo.size || 0 : 0;

      return {
        uri: result.uri,
        width: newWidth,
        height: newHeight,
        size: fileSize,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to compress image',
        error
      );
    }
  }

  /**
   * Upload image to Firebase Storage
   */
  static async uploadImageToStorage(
    imageUri: string,
    chatId: string,
    messageId: string
  ): Promise<string> {
    try {
      // Read the image file as blob
      const response = await fetch(imageUri);
      if (!response.ok) {
        throw new AppError(
          ErrorType.NETWORK,
          'Failed to read image file for upload'
        );
      }
      
      const blob = await response.blob();
      
      // Create reference path: chat-images/{chatId}/{messageId}
      const imagePath = `chat-images/${chatId}/${messageId}.jpg`;
      const imageRef = ref(storage, imagePath);
      
      // Upload image
      await uploadBytes(imageRef, blob);
      
      // Get download URL
      const downloadURL = await getDownloadURL(imageRef);
      
      return downloadURL;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to upload image',
        error
      );
    }
  }

  /**
   * Process image for chat: compress and upload
   */
  static async processImageForChat(
    imageUri: string,
    chatId: string,
    messageId: string
  ): Promise<{
    localUri: string;
    downloadURL: string;
    width: number;
    height: number;
    size: number;
  }> {
    try {
      
      // Step 1: Compress the image
      const compressedImage = await this.compressImage(imageUri);
      
      // Step 2: Upload to Firebase Storage
      const downloadURL = await this.uploadImageToStorage(
        compressedImage.uri,
        chatId,
        messageId
      );
      
      return {
        localUri: compressedImage.uri,
        downloadURL,
        width: compressedImage.width,
        height: compressedImage.height,
        size: compressedImage.size,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to process image for chat',
        error
      );
    }
  }

  /**
   * Generate a unique message ID for image uploads
   */
  static generateImageMessageId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get image dimensions from URI
   */
  static async getImageDimensions(imageUri: string): Promise<{ width: number; height: number }> {
    try {
      const result = await ImageManipulator.manipulateAsync(imageUri, [], {
        format: ImageManipulator.SaveFormat.JPEG
      });
      
      return {
        width: result.width,
        height: result.height,
      };
    } catch (error) {
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to get image dimensions',
        error
      );
    }
  }

  /**
   * Calculate appropriate image display size for chat
   */
  static calculateChatImageSize(
    originalWidth: number,
    originalHeight: number,
    maxDisplayWidth: number = 250,
    maxDisplayHeight: number = 300
  ): { width: number; height: number } {
    const widthRatio = maxDisplayWidth / originalWidth;
    const heightRatio = maxDisplayHeight / originalHeight;
    const ratio = Math.min(widthRatio, heightRatio, 1); // Don't upscale
    
    return {
      width: Math.round(originalWidth * ratio),
      height: Math.round(originalHeight * ratio),
    };
  }
}