// components/chat/MessageItem.tsx

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';
import { Message } from '@/types/messageTypes';
import ImageMessage from '@/components/media/ImageMessage';

interface MessageItemProps {
  message: Message;
  isOwnMessage: boolean;
  showSender: boolean;
}

const MessageItem: React.FC<MessageItemProps> = memo(({ message, isOwnMessage, showSender }) => {
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

  // Handle image messages
  if (message.type === 'image' && message.imageData) {
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
        
        <View style={styles.imageMessageWrapper}>
          {!isOwnMessage && showSender && (
            <Text style={styles.senderName}>
              {message.senderDisplayName || message.senderUsername}
            </Text>
          )}
          
          <ImageMessage
            imageData={message.imageData}
            isOwnMessage={isOwnMessage}
            timestamp={message.timestamp}
            status={message.status}
          />
          
          {/* Show caption if exists */}
          {message.content && (
            <View style={[
              styles.captionBubble,
              isOwnMessage ? styles.ownCaptionBubble : styles.otherCaptionBubble
            ]}>
              <Text style={[
                styles.captionText,
                isOwnMessage ? styles.ownCaptionText : styles.otherCaptionText
              ]}>
                {message.content}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // Handle text messages
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
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if these specific props change
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.editedAt === nextProps.message.editedAt &&
    prevProps.isOwnMessage === nextProps.isOwnMessage &&
    prevProps.showSender === nextProps.showSender
  );
});

MessageItem.displayName = 'MessageItem';

const styles = StyleSheet.create({
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
  // Image message specific styles
  imageMessageWrapper: {
    maxWidth: '75%',
  },
  captionBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 4,
  },
  ownCaptionBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherCaptionBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  captionText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownCaptionText: {
    color: '#fff',
  },
  otherCaptionText: {
    color: '#333',
  },
});

export default MessageItem;