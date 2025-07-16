// components/ImageMessage.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { ImageData } from '@/types/messageTypes';
import { ImageService } from '@/services/imageService';

interface ImageMessageProps {
  imageData: ImageData;
  isOwnMessage: boolean;
  timestamp: string;
  status?: 'sending' | 'sent' | 'read';
  maxWidth?: number;
}

const { width: screenWidth } = Dimensions.get('window');

export default function ImageMessage({
  imageData,
  isOwnMessage,
  timestamp,
  status,
  maxWidth = 250,
}: ImageMessageProps) {
  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Calculate display dimensions
  const displaySize = ImageService.calculateChatImageSize(
    imageData.width,
    imageData.height,
    maxWidth,
    300
  );

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusIcon = () => {
    if (!isOwnMessage) return '';
    
    switch (status) {
      case 'sending':
        return '⏳';
      case 'sent':
        return '✓';
      case 'read':
        return '✓✓';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'read':
        return '#34C759';
      case 'sent':
        return 'rgba(255,255,255,0.7)';
      case 'sending':
        return 'rgba(255,255,255,0.5)';
      default:
        return 'rgba(255,255,255,0.7)';
    }
  };

  const handleImagePress = () => {
    setFullScreenVisible(true);
  };

  const ImageContent = () => (
    <View style={styles.imageContainer}>
      {imageLoading && (
        <View style={[styles.loadingContainer, displaySize]}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      )}
      
      {imageError ? (
        <View style={[styles.errorContainer, displaySize]}>
          <Text style={styles.errorIcon}>📷</Text>
          <Text style={styles.errorText}>Failed to load image</Text>
        </View>
      ) : (
        <Image
          source={{ uri: imageData.downloadURL }}
          style={[styles.image, displaySize]}
          contentFit="cover"
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageLoading(false);
            setImageError(true);
          }}
          cachePolicy="memory-disk"
        />
      )}
      
      {/* Overlay with timestamp and status */}
      <View style={styles.overlay}>
        <Text style={[
          styles.timestamp,
          isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp
        ]}>
          {formatTime(timestamp)}
        </Text>
        
        {isOwnMessage && (
          <Text style={[styles.statusIcon, { color: getStatusColor() }]}>
            {getStatusIcon()}
          </Text>
        )}
      </View>
    </View>
  );

  const FullScreenModal = () => (
    <Modal
      visible={fullScreenVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setFullScreenVisible(false)}
    >
      <View style={styles.fullScreenContainer}>
        <TouchableOpacity
          style={styles.closeFullScreen}
          onPress={() => setFullScreenVisible(false)}
        >
          <Text style={styles.closeFullScreenText}>✕</Text>
        </TouchableOpacity>
        
        <View style={styles.fullScreenImageContainer}>
          <Image
            source={{ uri: imageData.downloadURL }}
            style={styles.fullScreenImage}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        </View>
        
        <View style={styles.fullScreenInfo}>
          <Text style={styles.fullScreenTimestamp}>
            {new Date(timestamp).toLocaleString()}
          </Text>
          <Text style={styles.fullScreenSize}>
            {imageData.width} × {imageData.height} • {Math.round(imageData.size / 1024)} KB
          </Text>
        </View>
      </View>
    </Modal>
  );

  return (
    <>
      <TouchableOpacity
        style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
        ]}
        onPress={handleImagePress}
        activeOpacity={0.8}
      >
        <ImageContent />
      </TouchableOpacity>
      
      <FullScreenModal />
    </>
  );
}

const styles = StyleSheet.create({
  messageBubble: {
    borderRadius: 16,
    overflow: 'hidden',
    maxWidth: '75%',
    marginVertical: 1,
  },
  ownMessageBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  imageContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
  },
  image: {
    borderRadius: 12,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
  },
  errorIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#fff',
  },
  ownTimestamp: {
    color: '#fff',
  },
  otherTimestamp: {
    color: '#fff',
  },
  statusIcon: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  // Full screen modal styles
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFullScreen: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFullScreenText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  fullScreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  fullScreenImage: {
    width: screenWidth - 40,
    height: '80%',
  },
  fullScreenInfo: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  fullScreenTimestamp: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  fullScreenSize: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
});