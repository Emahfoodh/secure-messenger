// services/videoService.ts

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebaseConfig';
import { AppError, ErrorType } from '@/services/errorService';
import { VideoData } from '@/types/messageTypes';
import { Camera } from 'expo-camera';

export interface VideoPickerOptions {
  allowsEditing?: boolean;
  videoMaxDuration?: number; // in seconds
  quality?: number; // 0 to 1, where 1 is highest quality
}

export interface CompressedVideoResult {
  uri: string;
  width: number;
  height: number;
  duration: number;
  size: number; // in bytes
}

export class VideoService {
  // Maximum video duration (30 seconds for messaging)
  private static MAX_DURATION = 30;
  private static MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  /**
   * Request camera permissions for video recording
   */
  static async requestCameraPermissions(): Promise<boolean> {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      return status === 'granted';
    } catch (error: any) {
      throw new AppError(
        ErrorType.PERMISSION,
        'Failed to request camera permissions',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Request microphone permissions for video recording
   */
  static async requestMicrophonePermissions(): Promise<boolean> {
    try {
      const { status } = await Camera.requestMicrophonePermissionsAsync();
      return status === 'granted';
    } catch (error: any) {
      throw new AppError(
        ErrorType.PERMISSION,
        'Failed to request microphone permissions',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
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
    } catch (error: any) {
      throw new AppError(
        ErrorType.PERMISSION,
        'Failed to request media library permissions',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Record video with camera
   */
  static async recordVideoWithCamera(options: VideoPickerOptions = {}): Promise<ImagePicker.ImagePickerAsset | null> {
    try {
      // Request permissions
      const [cameraPermission, microphonePermission] = await Promise.all([
        this.requestCameraPermissions(),
        this.requestMicrophonePermissions()
      ]);

      if (!cameraPermission) {
        throw new AppError(
          ErrorType.PERMISSION,
          'Camera permission is required to record videos'
        );
      }

      if (!microphonePermission) {
        throw new AppError(
          ErrorType.PERMISSION,
          'Microphone permission is required to record videos with audio'
        );
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        allowsEditing: options.allowsEditing ?? false,
        videoMaxDuration: options.videoMaxDuration ?? this.MAX_DURATION,
        quality: options.quality ?? 1,
      });

      if (result.canceled) {
        return null;
      }

      const video = result.assets[0];
      
      // Validate video duration and size
      await this.validateVideo(video);

      return video;
    } catch (error: any) {
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to record video',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Pick video from gallery
   */
  static async pickVideoFromGallery(options: VideoPickerOptions = {}): Promise<ImagePicker.ImagePickerAsset | null> {
    try {
      // Request permissions
      const hasPermission = await this.requestMediaLibraryPermissions();
      if (!hasPermission) {
        throw new AppError(
          ErrorType.PERMISSION,
          'Media library permission is required to select videos'
        );
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: options.allowsEditing ?? false,
        videoMaxDuration: options.videoMaxDuration ?? this.MAX_DURATION,
        quality: options.quality ?? 1,
      });

      if (result.canceled) {
        return null;
      }

      const video = result.assets[0];
      
      // Validate video duration and size
      await this.validateVideo(video);

      return video;
    } catch (error: any) {
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to select video from gallery',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Validate video file
   */
  private static async validateVideo(video: ImagePicker.ImagePickerAsset): Promise<void> {
    // Check duration
    if (video.duration && video.duration > this.MAX_DURATION * 1000) {
      throw new AppError(
        ErrorType.VALIDATION,
        `Video is too long. Maximum duration is ${this.MAX_DURATION} seconds.`
      );
    }

    // Check file size
    const fileInfo = await FileSystem.getInfoAsync(video.uri);
    if (fileInfo.exists && fileInfo.size && fileInfo.size > this.MAX_FILE_SIZE) {
      throw new AppError(
        ErrorType.VALIDATION,
        'Video file is too large. Maximum size is 50MB.'
      );
    }
  }

  /**
   * Get video information
   */
  static async getVideoInfo(videoUri: string): Promise<{
    width: number;
    height: number;
    duration: number;
    size: number;
  }> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(videoUri);
      if (!fileInfo.exists) {
        throw new AppError(ErrorType.VALIDATION, 'Video file not found');
      }

      // For video info, we'll need to use the ImagePicker result data
      // since Expo doesn't have a direct video info API
      return {
        width: 0, // These will be provided by the picker
        height: 0,
        duration: 0,
        size: fileInfo.size || 0,
      };
    } catch (error: any) {
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to get video information',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Upload video to Firebase Storage
   */
  static async uploadVideoToStorage(
    videoUri: string,
    chatId: string,
    messageId: string
  ): Promise<string> {
    try {
      // Read the video file as blob
      const response = await fetch(videoUri);
      if (!response.ok) {
        throw new AppError(
          ErrorType.NETWORK,
          'Failed to read video file for upload'
        );
      }
      
      const blob = await response.blob();
      
      // Create reference path: chat-videos/{chatId}/{messageId}
      const videoPath = `chat-videos/${chatId}/${messageId}.mp4`;
      const videoRef = ref(storage, videoPath);
      
      // Upload video
      await uploadBytes(videoRef, blob);
      
      // Get download URL
      const downloadURL = await getDownloadURL(videoRef);
      
      return downloadURL;
    } catch (error: any) {
      throw new AppError(
        ErrorType.STORAGE,
        'Failed to upload video',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Process video for chat: validate and upload
   */
  static async processVideoForChat(
    video: VideoData,
    chatId: string,
    messageId: string
  ): Promise<VideoData> {
    try {
      // Step 1: Get file size
      const fileInfo = await FileSystem.getInfoAsync(video.uri);
      const fileSize = fileInfo.exists ? (fileInfo.size || 0) : 0;
      
      // Step 2: Upload to Firebase Storage
      const downloadURL = await this.uploadVideoToStorage(
        video.uri,
        chatId,
        messageId
      );
      
      return {
        uri: video.uri,
        downloadURL,
        duration: (video.duration || 0) / 1000, // Convert to seconds
        width: video.width || 0,
        height: video.height || 0,
        size: fileSize,
      };
    } catch (error: any) {
      throw new AppError(
        ErrorType.UNKNOWN,
        'Failed to process video for chat',
        error instanceof AppError ? error : error instanceof Error ? error : new Error(error)
      );
    }
  }

  /**
   * Generate a unique message ID for video uploads
   */
  static generateVideoMessageId(): string {
    return `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate appropriate video display size for chat
   */
  static calculateChatVideoSize(
    originalWidth: number,
    originalHeight: number,
    maxDisplayWidth: number = 280,
    maxDisplayHeight: number = 200
  ): { width: number; height: number } {
    if (originalWidth === 0 || originalHeight === 0) {
      return { width: maxDisplayWidth, height: maxDisplayHeight };
    }

    const widthRatio = maxDisplayWidth / originalWidth;
    const heightRatio = maxDisplayHeight / originalHeight;
    const ratio = Math.min(widthRatio, heightRatio, 1); // Don't upscale
    
    return {
      width: Math.round(originalWidth * ratio),
      height: Math.round(originalHeight * ratio),
    };
  }

  /**
   * Format video duration for display
   */
  static formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `0:${seconds.toString().padStart(2, '0')}`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format video file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}