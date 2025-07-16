// components/ImagePickerModal.tsx

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
import { ImageService } from '@/services/imageService';
import { ErrorService } from '@/services/errorService';
import * as ImagePicker from 'expo-image-picker';

interface ImagePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onImageSelected: (image: ImagePicker.ImagePickerAsset) => void;
}

export default function ImagePickerModal({
  visible,
  onClose,
  onImageSelected,
}: ImagePickerModalProps) {
  const [loading, setLoading] = useState(false);

  const handleCameraPress = async () => {
    setLoading(true);
    try {
      const image = await ImageService.pickImageFromCamera({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });

      if (image) {
        onImageSelected(image);
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
      const image = await ImageService.pickImageFromGallery({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });

      if (image) {
        onImageSelected(image);
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
            <Text style={styles.title}>Select Image</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.options}>
            <TouchableOpacity
              style={styles.option}
              onPress={handleCameraPress}
              disabled={loading}
            >
              <View style={styles.optionIcon}>
                <Text style={styles.iconText}>📷</Text>
              </View>
              <Text style={styles.optionTitle}>Camera</Text>
              <Text style={styles.optionSubtitle}>Take a new photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              onPress={handleGalleryPress}
              disabled={loading}
            >
              <View style={styles.optionIcon}>
                <Text style={styles.iconText}>🖼️</Text>
              </View>
              <Text style={styles.optionTitle}>Gallery</Text>
              <Text style={styles.optionSubtitle}>Choose from library</Text>
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
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
    flex: 1,
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#666',
    flex: 1,
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