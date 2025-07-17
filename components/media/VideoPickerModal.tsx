// components/media/VideoPickerModal.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { VideoService } from '@/services/videoService';
import { ErrorService } from '@/services/errorService';
import * as ImagePicker from 'expo-image-picker';

interface VideoPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onVideoSelected: (video: ImagePicker.ImagePickerAsset) => void;
}

export default function VideoPickerModal({
  visible,
  onClose,
  onVideoSelected,
}: VideoPickerModalProps) {
  const [loading, setLoading] = useState(false);

  const handleCameraPress = async () => {
    setLoading(true);
    try {
      const video = await VideoService.recordVideoWithCamera({
        allowsEditing: false,
        videoMaxDuration: 30, // 30 seconds max
        quality: 1, // High quality
      });

      if (video) {
        onVideoSelected(video);
        onClose();
      }
    } catch (error) {
      ErrorService.handleError(error, 'Camera');
    } finally {
      setLoading(false);
    }
  };

  const handleGalleryPress = async () => {
    setLoading(true);
    try {
      const video = await VideoService.pickVideoFromGallery({
        allowsEditing: false,
        videoMaxDuration: 30, // 30 seconds max
        quality: 1, // High quality
      });

      if (video) {
        onVideoSelected(video);
        onClose();
      }
    } catch (error) {
      ErrorService.handleError(error, 'Gallery');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Processing...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Video</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>📹 Max duration: 30 seconds</Text>
            <Text style={styles.infoText}>📦 Max file size: 50MB</Text>
          </View>

          <View style={styles.options}>
            <TouchableOpacity
              style={styles.option}
              onPress={handleCameraPress}
              disabled={loading}
            >
              <View style={styles.optionIcon}>
                <Text style={styles.iconText}>🎥</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Record Video</Text>
                <Text style={styles.optionSubtitle}>Record a new video</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              onPress={handleGalleryPress}
              disabled={loading}
            >
              <View style={styles.optionIcon}>
                <Text style={styles.iconText}>📱</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Choose from Gallery</Text>
                <Text style={styles.optionSubtitle}>Select from your videos</Text>
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34, // Safe area padding
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  infoContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  options: {
    padding: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconText: {
    fontSize: 24,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  cancelButton: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 150,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
});