import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { MessageService } from '@/services/messageService';
import { ChatService } from '@/services/chatService';
import { getUserProfile } from '@/services/userService';
import { isContact } from '@/services/contactService';
import { Message, Chat } from '@/types/messageTypes';
import { ErrorService } from '@/services/errorService';

interface MessageItemProps {
  message: Message;
  isOwnMessage: boolean;
  showSender: boolean;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isOwnMessage, showSender }) => {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusIcon = () => {
    // Only show status for our own messages
    if (!isOwnMessage) return '';
    
    switch (message.status) {
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
    switch (message.status) {
      case 'read':
        return '#34C759'; // Green for read
      case 'sent':
        return 'rgba(255,255,255,0.7)'; // Light for sent
      case 'sending':
        return 'rgba(255,255,255,0.5)'; // Very light for sending
      default:
        return 'rgba(255,255,255,0.7)';
    }
  };

  return (
    <View style={[
      styles.messageContainer,
      isOwnMessage ? styles.ownMessageContainer : styles.otherMessageContainer
    ]}>
      {!isOwnMessage && showSender && message.senderProfilePicture && (
        <Image 
          source={{ uri: message.senderProfilePicture }} 
          style={styles.senderAvatar} 
        />
      )}
      
      <View style={[
        styles.messageBubble,
        isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
      ]}>
        {!isOwnMessage && showSender && (
          <Text style={styles.senderName}>
            {message.senderDisplayName || message.senderUsername}
          </Text>
        )}
        
        <Text style={[
          styles.messageText,
          isOwnMessage ? styles.ownMessageText : styles.otherMessageText
        ]}>
          {message.content}
        </Text>

        {message.editedAt && (
          <Text style={styles.editedText}>edited</Text>
        )}
        
        <View style={styles.messageFooter}>
          <Text style={[
            styles.timestamp,
            isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp
          ]}>
            {formatTime(message.timestamp)}
          </Text>
          
          {isOwnMessage && (
            <Text style={[styles.statusIcon, { color: getStatusColor() }]}>
              {getStatusIcon()}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

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
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!chatId || !user) return;

    // Load chat details and check contact status
    loadChatDetails();
    checkContactStatus();

    // Listen to messages with automatic read marking
    const unsubscribe = MessageService.listenToMessages(
      chatId,
      user.uid, // Pass current user ID for read marking
      (newMessages) => {
        setMessages(newMessages);
        setLoading(false);
        // Mark chat as read when messages are loaded
        if (isContactValid) {
          ChatService.markChatAsRead(chatId, user.uid);
        }
      }
    );

    return unsubscribe;
  }, [chatId, user]);

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
      // Get the other participant's UID
      const otherParticipant = getOtherParticipant();
      if (!otherParticipant) {
        setIsContactValid(false);
        return;
      }

      // Check if they're still contacts
      const stillContacts = await isContact(user.uid, otherParticipant.uid);
      setIsContactValid(stillContacts);
    } catch (error) {
      console.error('Error checking contact status:', error);
      // On error, assume contact is valid to avoid blocking functionality
      setIsContactValid(true);
    } finally {
      setCheckingContact(false);
    }
  };

  // Check contact status whenever chat changes
  useEffect(() => {
    if (chat) {
      checkContactStatus();
    }
  }, [chat]);

  const sendMessage = async () => {
    if (!inputText.trim() || !user || !chatId || sending) return;

    // Check if contact is still valid before sending
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
      // Get current user profile for username
      const currentUserProfile = await getUserProfile(user.uid);
      const senderUsername = currentUserProfile?.username || user.email || 'User';

      // Send message
      await MessageService.sendMessage(chatId, user.uid, {
        content: messageContent,
        type: 'text',
      });

      // Update last message in chat
      await ChatService.updateLastMessage(chatId, user.uid, senderUsername, messageContent);

      // Increment unread count for other participants
      if (chat) {
        const otherParticipants = chat.participants.filter(p => p !== user.uid);
        await Promise.all(
          otherParticipants.map(participantId => 
            ChatService.incrementUnreadCount(chatId, participantId)
          )
        );
      }

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      ErrorService.handleError(error, 'Send Message');
      // Restore message text on error
      setInputText(messageContent);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwnMessage = item.senderId === user?.uid;
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const showSender = !previousMessage || previousMessage.senderId !== item.senderId;

    return (
      <MessageItem
        message={item}
        isOwnMessage={isOwnMessage}
        showSender={showSender}
      />
    );
  };

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

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

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
    </KeyboardAvoidingView>
  );
}

// Keep all the existing styles from your current chat screen
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
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 8,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 16,
  },
  ownMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
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
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#333',
  },
  editedText: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 2,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    flex: 1,
  },
  ownTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  otherTimestamp: {
    color: '#999',
  },
  statusIcon: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: 'bold',
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
});