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
import VideoPickerModal from '@/components/media/VideoPickerModal';
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
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [sendingVideo, setSendingVideo] = useState(false);
  
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

  // Update displayed messages when allMessages changes - FIXED
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

      // Send actual image message
      await MessageService.sendImageMessage(chatId, user.uid, image.uri);

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
    } finally {
      setSendingImage(false);
    }
  };

  // NEW: Handle video selection
  const handleVideoSelected = async (video: ImagePicker.ImagePickerAsset) => {
    if (!user || !chatId || sendingVideo) return;

    if (!isContactValid) {
      Alert.alert(
        'Cannot Send Video',
        'You can only send videos to your contacts. This person is no longer in your contacts list.',
        [{ text: 'OK' }]
      );
      return;
    }

    setSendingVideo(true);
    
    try {
      const currentUserProfile = await getUserProfile(user.uid);
      const senderUsername = currentUserProfile?.username || user.email || 'User';

      // Send actual video message
      await MessageService.sendVideoMessage(chatId, user.uid, video);

      // Update last message and unread counts
      await Promise.all([
        ChatService.updateLastMessage(chatId, user.uid, senderUsername, '🎥 Video', 'video'),
        chat ? Promise.all(
          chat.participants.filter(p => p !== user.uid).map(participantId => 
            ChatService.incrementUnreadCount(chatId, participantId)
          )
        ) : Promise.resolve()
      ]);

    } catch (error) {
      ErrorService.handleError(error, 'Send Video');
    } finally {
      setSendingVideo(false);
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
        <ActivityIndicator size="large" color="#007AFF" />
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
            style={styles.mediaButton}
            onPress={() => setShowImagePicker(true)}
            disabled={sendingImage || sendingVideo}
          >
            <Text style={styles.mediaButtonText}>
              {sendingImage ? '⏳' : '📷'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mediaButton}
            onPress={() => setShowVideoPicker(true)}
            disabled={sendingImage || sendingVideo}
          >
            <Text style={styles.mediaButtonText}>
              {sendingVideo ? '⏳' : '🎥'}
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

      {/* Video Picker Modal */}
      <VideoPickerModal
        visible={showVideoPicker}
        onClose={() => setShowVideoPicker(false)}
        onVideoSelected={handleVideoSelected}
      />

      {/* Sending Media Overlay */}
      {(sendingImage || sendingVideo) && (
        <View style={styles.sendingMediaOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.sendingMediaText}>
            {sendingImage ? 'Processing and sending image...' : 'Processing and sending video...'}
          </Text>
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
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  mediaButtonText: {
    fontSize: 16,
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
  sendingMediaOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendingMediaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
});