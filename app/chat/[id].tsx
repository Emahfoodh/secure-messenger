// app/chat/[id].tsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { MessageService, MessagesPaginationResult } from '@/services/messageService';
import { ChatService } from '@/services/chatService';
import { getUserProfile } from '@/services/userService';
import { isContact } from '@/services/contactService';
import { Message, Chat } from '@/types/messageTypes';
import { ErrorService } from '@/services/errorService';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import ImagePickerModal from '@/components/media/ImagePickerModal';
import MessageItem from '@/components/chat/MessageItem';
import * as ImagePicker from 'expo-image-picker';

export default function ChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isContactValid, setIsContactValid] = useState(true);
  const [checkingContact, setCheckingContact] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  
  // Pagination states
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | undefined>();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  
  const flatListRef = useRef<FlatList>(null);

  // Load initial messages and set up real-time listener
  useEffect(() => {
    if (!chatId || !user) return;

    loadChatDetails();
    checkContactStatus();

    // Listen to recent messages only (for real-time updates)
    const unsubscribe = MessageService.listenToRecentMessages(
      chatId,
      user.uid,
      (recentMessages) => {
        setAllMessages(prevMessages => {
          // Merge recent messages with older loaded messages
          const messageIds = new Set(recentMessages.map(m => m.id));
          const olderMessages = prevMessages.filter(m => !messageIds.has(m.id));
          
          // For inverted list, we want newest messages first
          const allSorted = [...recentMessages, ...olderMessages].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          
          return allSorted;
        });
        setLoading(false);
        
        // Mark chat as read when messages are loaded
        if (isContactValid) {
          ChatService.markChatAsRead(chatId, user.uid);
        }
      }
    );

    return unsubscribe;
  }, [chatId, user]);

  // Update displayed messages when allMessages changes
  useEffect(() => {
    setMessages(allMessages);
  }, [allMessages]);

  const loadChatDetails = async () => {
    if (!chatId) return;
    
    try {
      const chatData = await ChatService.getChatById(chatId);
      setChat(chatData);
    } catch (error) {
      ErrorService.handleError(error, 'Load Chat');
    }
  };

  const checkContactStatus = async () => {
    if (!chatId || !user || !chat) return;
    
    setCheckingContact(true);
    try {
      const otherParticipant = getOtherParticipant();
      if (!otherParticipant) {
        setIsContactValid(false);
        return;
      }

      const stillContacts = await isContact(user.uid, otherParticipant.uid);
      setIsContactValid(stillContacts);
    } catch (error) {
      console.error('Error checking contact status:', error);
      setIsContactValid(true);
    } finally {
      setCheckingContact(false);
    }
  };

  useEffect(() => {
    if (chat) {
      checkContactStatus();
    }
  }, [chat]);

  // Load older messages when user scrolls to bottom (in inverted list)
  const loadOlderMessages = useCallback(async () => {
    if (!chatId || !hasMoreMessages || loadingOlderMessages) return;

    setLoadingOlderMessages(true);
    
    try {
      const result: MessagesPaginationResult = await MessageService.loadOlderMessages(
        chatId,
        lastDoc
      );

      if (result.messages.length > 0) {
        setAllMessages(prevMessages => {
          // Add older messages to the end (they'll appear at bottom in inverted list)
          const messageIds = new Set(prevMessages.map(m => m.id));
          const newOlderMessages = result.messages.filter(m => !messageIds.has(m.id));
          
          // Sort older messages and add to end
          const sortedOlderMessages = newOlderMessages.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          
          return [...prevMessages, ...sortedOlderMessages];
        });
        
        setLastDoc(result.lastDoc);
      }
      
      setHasMoreMessages(result.hasMore);
    } catch (error) {
      ErrorService.handleError(error, 'Load Older Messages');
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [chatId, lastDoc, hasMoreMessages, loadingOlderMessages]);

  const sendMessage = async () => {
    if (!inputText.trim() || !user || !chatId || sending) return;

    if (!isContactValid) {
      Alert.alert(
        'Cannot Send Message',
        'You can only send messages to your contacts. This person is no longer in your contacts list.',
        [{ text: 'OK' }]
      );
      return;
    }

    const messageContent = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const currentUserProfile = await getUserProfile(user.uid);
      const senderUsername = currentUserProfile?.username || user.email || 'User';

      await MessageService.sendMessage(chatId, user.uid, {
        content: messageContent,
        type: 'text',
      });

      // Update last message and unread counts
      await Promise.all([
        ChatService.updateLastMessage(chatId, user.uid, senderUsername, messageContent),
        chat ? Promise.all(
          chat.participants.filter(p => p !== user.uid).map(participantId => 
            ChatService.incrementUnreadCount(chatId, participantId)
          )
        ) : Promise.resolve()
      ]);

    } catch (error) {
      ErrorService.handleError(error, 'Send Message');
      setInputText(messageContent);

    } finally {
      setSending(false);
    }
  };

  const handleImageSelected = async (image: ImagePicker.ImagePickerAsset) => {
    if (!user || !chatId || sendingImage) return;

    if (!isContactValid) {
      Alert.alert(
        'Cannot Send Image',
        'You can only send images to your contacts. This person is no longer in your contacts list.',
        [{ text: 'OK' }]
      );
      return;
    }

    setSendingImage(true);
    
    try {
      const currentUserProfile = await getUserProfile(user.uid);
      const senderUsername = currentUserProfile?.username || user.email || 'User';

      // Create optimistic image message
      const optimisticMessage: Message = {
        id: `temp_img_${Date.now()}`,
        chatId,
        senderId: user.uid,
        senderUsername,
        senderDisplayName: currentUserProfile?.displayName,
        senderProfilePicture: currentUserProfile?.profilePicture,
        content: '',
        type: 'image',
        timestamp: new Date().toISOString(),
        status: 'sending',
        imageData: {
          uri: image.uri,
          downloadURL: '', // Will be updated when actual message comes through
          width: image.width || 0,
          height: image.height || 0,
          size: 0,
        },
      };

      // Add optimistic message immediately
      setAllMessages(prevMessages => [optimisticMessage, ...prevMessages]);

      // Send actual image message
      await MessageService.sendImageMessage(chatId, user.uid, image.uri);

      // Remove optimistic message (real one will come through listener)
      setAllMessages(prevMessages => 
        prevMessages.filter(msg => msg.id !== optimisticMessage.id)
      );

      // Update last message and unread counts
      await Promise.all([
        ChatService.updateLastMessage(chatId, user.uid, senderUsername, '📷 Photo', 'image'),
        chat ? Promise.all(
          chat.participants.filter(p => p !== user.uid).map(participantId => 
            ChatService.incrementUnreadCount(chatId, participantId)
          )
        ) : Promise.resolve()
      ]);

    } catch (error) {
      ErrorService.handleError(error, 'Send Image');
      
      // Remove optimistic message on error
      setAllMessages(prevMessages => 
        prevMessages.filter(msg => msg.id !== `temp_img_${Date.now()}`)
      );
    } finally {
      setSendingImage(false);
    }
  };

  // Optimized render function with keyExtractor (adjusted for inverted list)
  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isOwnMessage = item.senderId === user?.uid;
    // In inverted list, next message is at index + 1
    const nextMessage = index < messages.length - 1 ? messages[index + 1] : null;
    const showSender = !nextMessage || nextMessage.senderId !== item.senderId;

    return (
      <MessageItem
        message={item}
        isOwnMessage={isOwnMessage}
        showSender={showSender}
      />
    );
  }, [messages, user]);

  // Optimized key extractor
  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Handle reaching end (which is bottom in inverted list) for pagination
  const handleEndReached = useCallback(() => {
    if (hasMoreMessages && !loadingOlderMessages) {
      loadOlderMessages();
    }
  }, [hasMoreMessages, loadingOlderMessages, loadOlderMessages]);

  const getOtherParticipant = () => {
    if (!chat || !user) return null;
    return chat.participantDetails.find(p => p.uid !== user.uid);
  };

  const otherParticipant = getOtherParticipant();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading chat...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Chat Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          {otherParticipant?.profilePicture ? (
            <Image 
              source={{ uri: otherParticipant.profilePicture }} 
              style={styles.headerAvatar} 
            />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>
                {otherParticipant?.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>
              {otherParticipant?.displayName || otherParticipant?.username}
            </Text>
            <Text style={styles.headerSubtitle}>
              @{otherParticipant?.username}
            </Text>
          </View>
        </View>
      </View>

      {/* Messages List with Pagination - INVERTED */}
      <View style={styles.messagesContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          inverted={true} // This is the key - inverted list
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.1}
          ListFooterComponent={
            loadingOlderMessages ? (
              <View style={styles.loadingOlderContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingOlderText}>Loading older messages...</Text>
              </View>
            ) : null
          }
          removeClippedSubviews={true} // Performance optimization
          maxToRenderPerBatch={10} // Render fewer items per batch
          updateCellsBatchingPeriod={50} // Update batching period
          windowSize={10} // Reduce window size
          initialNumToRender={15} // Reduce initial render count
        />
      </View>

      {/* Contact Status Warning */}
      {!isContactValid && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            ⚠️ This person is no longer in your contacts. You cannot send new messages.
          </Text>
          <TouchableOpacity
            style={styles.addContactButton}
            onPress={() => router.push('/(tabs)/contacts')}
          >
            <Text style={styles.addContactButtonText}>Go to Contacts</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message Input */}
      {isContactValid ? (
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.imageButton}
            onPress={() => setShowImagePicker(true)}
            disabled={sendingImage}
          >
            <Text style={styles.imageButtonText}>
              {sendingImage ? '⏳' : '📷'}
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />
          
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>
              {sending ? '⏳' : '→'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.disabledInputContainer}>
          <Text style={styles.disabledInputText}>
            Messaging is disabled - not in contacts
          </Text>
        </View>
      )}

      {/* Image Picker Modal */}
      <ImagePickerModal
        visible={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onImageSelected={handleImageSelected}
      />

      {/* Sending Image Overlay */}
      {sendingImage && (
        <View style={styles.sendingImageOverlay}>
          <Text style={styles.sendingImageText}>Sending image...</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  backButton: {
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 24,
    color: '#007AFF',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  messagesContainer: {
    flex: 1,
  },
  loadingOlderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#f8f9fa',
  },
  loadingOlderText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  imageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  imageButtonText: {
    fontSize: 18,
    color: '#fff',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 16,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  warningContainer: {
    backgroundColor: '#fff3cd',
    borderTopWidth: 1,
    borderTopColor: '#ffeaa7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
    marginBottom: 8,
  },
  addContactButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addContactButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledInputContainer: {
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  disabledInputText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  sendingImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendingImageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
});