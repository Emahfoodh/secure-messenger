import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Image,
  Modal,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useAuth } from '@/context/AuthContext';
import { parseQRData } from '@/services/qrService';
import { getUserProfile, UserProfile } from '@/services/userService';
import { 
  sendContactRequest, 
  isContact, 
  checkExistingRequest 
} from '@/services/contactService';

interface QRScannerScreenProps {
  onClose: () => void;
  onScanComplete: () => void;
}

const { width } = Dimensions.get('window');

export default function QRScannerScreen({ onClose, onScanComplete }: QRScannerScreenProps) {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [scannedUserProfile, setScannedUserProfile] = useState<UserProfile | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    getCameraPermissions();
  }, []);

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || processing || !user) return;
    
    setScanned(true);
    setProcessing(true);

    try {
      const qrData = parseQRData(data);
      
      if (!qrData) {
        Alert.alert(
          'Invalid QR Code', 
          'This QR code is not valid for adding contacts.',
          [
            {
              text: 'OK',
              onPress: () => {
                setProcessing(false);
              },
            },
          ]
        );
        return;
      }

      if (qrData.uid === user.uid) {
        Alert.alert(
          'Invalid QR Code', 
          'You cannot add yourself as a contact.',
          [
            {
              text: 'OK',
              onPress: () => {
                setProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Check if already a contact
      const alreadyContact = await isContact(user.uid, qrData.uid);
      if (alreadyContact) {
        Alert.alert(
          'Already a Contact', 
          `${qrData.username} is already in your contacts.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Check for existing request
      const existingRequest = await checkExistingRequest(user.uid, qrData.uid);
      if (existingRequest) {
        const isIncoming = existingRequest.toUid === user.uid;
        const isOutgoing = existingRequest.fromUid === user.uid;
        
        Alert.alert(
          'Request Exists', 
          isIncoming 
            ? `${qrData.username} has already sent you a contact request. Check your requests tab.`
            : `You have already sent a contact request to ${qrData.username}.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Get full user profile
      const userProfile = await getUserProfile(qrData.uid);
      if (!userProfile) {
        Alert.alert(
          'User Not Found', 
          'This user could not be found.',
          [
            {
              text: 'OK',
              onPress: () => {
                setProcessing(false);
              },
            },
          ]
        );
        return;
      }

      // Show confirmation modal with user details
      setScannedUserProfile(userProfile);
      setProcessing(false);
      setShowConfirmModal(true);

    } catch (error) {
      console.error('Error processing QR code:', error);
      Alert.alert(
        'Error', 
        'An error occurred while processing the QR code.',
        [
          {
            text: 'OK',
            onPress: () => {
              setProcessing(false);
            },
          },
        ]
      );
    }
  };

  const handleSendRequest = async () => {
    if (!user || !scannedUserProfile) return;

    // Get current user profile to send with request
    const currentUserProfile = await getUserProfile(user.uid);
    if (!currentUserProfile) {
      Alert.alert('Error', 'Could not load your profile information');
      return;
    }

    setSendingRequest(true);
    const success = await sendContactRequest(currentUserProfile, scannedUserProfile);
    setSendingRequest(false);

    if (success) {
      setShowConfirmModal(false);
      Alert.alert(
        'Request Sent',
        `Contact request sent to ${scannedUserProfile.username}!`,
        [
          {
            text: 'OK',
            onPress: () => {
              onScanComplete();
              onClose();
            },
          },
        ]
      );
    } else {
      Alert.alert('Error', 'Failed to send contact request. Please try again.');
    }
  };

  const handleCancelRequest = () => {
    setShowConfirmModal(false);
    setScannedUserProfile(null);
    // Don't reset scanner - user needs to tap "Scan Again"
  };

  const resetScanner = () => {
    setScanned(false);
    setProcessing(false);
    setShowConfirmModal(false);
    setScannedUserProfile(null);
  };

  const ConfirmationModal = () => {
    if (!scannedUserProfile) return null;

    return (
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelRequest}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Contact Request</Text>
            
            <View style={styles.userPreview}>
              {scannedUserProfile.profilePicture ? (
                <Image 
                  source={{ uri: scannedUserProfile.profilePicture }} 
                  style={styles.previewAvatar} 
                />
              ) : (
                <View style={styles.previewAvatarPlaceholder}>
                  <Text style={styles.previewAvatarText}>
                    {scannedUserProfile.username.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              
              <View style={styles.userInfo}>
                <Text style={styles.previewUsername}>{scannedUserProfile.username}</Text>
                {scannedUserProfile.displayName && (
                  <Text style={styles.previewDisplayName}>{scannedUserProfile.displayName}</Text>
                )}
                <Text style={styles.previewEmail}>{scannedUserProfile.email}</Text>
              </View>
            </View>

            <Text style={styles.confirmationText}>
              Do you want to send a contact request to this user?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCancelRequest}
                disabled={sendingRequest}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleSendRequest}
                disabled={sendingRequest}
              >
                <Text style={styles.confirmButtonText}>
                  {sendingRequest ? 'Sending...' : 'Send Request'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (hasPermission === null) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera permission is required to scan QR codes
        </Text>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
          <Text style={styles.headerButtonText}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan QR Code</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.scannerContainer}>
        <CameraView
          style={styles.scanner}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        />
        
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={styles.cornerTopLeft} />
            <View style={styles.cornerTopRight} />
            <View style={styles.cornerBottomLeft} />
            <View style={styles.cornerBottomRight} />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.instructionText}>
          {processing ? 'Processing...' : 
           scanned ? 'Scan completed' : 
           'Position the QR code within the frame to scan'}
        </Text>
        
        {(scanned && !processing && !showConfirmModal) && (
          <TouchableOpacity
            style={styles.scanAgainButton}
            onPress={resetScanner}
          >
            <Text style={styles.scanAgainButtonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
      </View>

      <ConfirmationModal />
    </View>
  );
}

// Keep all the existing styles and add these new ones:
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 1,
  },
  headerButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 60,
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  scanner: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: width * 0.7,
    height: width * 0.7,
    position: 'relative',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#fff',
  },
  cornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#fff',
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#fff',
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#fff',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  instructionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanAgainButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  scanAgainButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: width * 0.9,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  userPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  previewAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  previewAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  previewAvatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  previewUsername: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  previewDisplayName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 2,
  },
  previewEmail: {
    fontSize: 14,
    color: '#999',
  },
  confirmationText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    marginRight: 10,
  },
  confirmButton: {
    backgroundColor: '#007AFF',
    marginLeft: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});