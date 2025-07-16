// app/(tabs)/index.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { ChatService } from '@/services/chatService';
import { ChatListItem } from '@/types/messageTypes';
import { ErrorService } from '@/services/errorService';

interface ChatItemProps {
  item: ChatListItem;
  onPress: (chatId: string) => void;
}

const ChatItem: React.FC<ChatItemProps> = ({ item, onPress }) => {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (diffInDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const getLastMessagePreview = () => {
    if (!item.lastMessage) {
      return 'No messages yet';
    }

    const { content, isOwnMessage, senderUsername } = item.lastMessage;
    const preview = content.length > 50 ? `${content.substring(0, 50)}...` : content;
    
    if (isOwnMessage) {
      return `You: ${preview}`;
    } else {
      return preview;
    }
  };

  return (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => onPress(item.chat.id)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        {item.otherParticipant.profilePicture ? (
          <Image 
            source={{ uri: item.otherParticipant.profilePicture }} 
            style={styles.avatar} 
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {item.otherParticipant.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName}>
            {item.otherParticipant.displayName || item.otherParticipant.username}
          </Text>
          <Text style={styles.timestamp}>
            {item.lastMessage ? formatTime(item.lastMessage.timestamp) : ''}
          </Text>
        </View>
        
        <Text 
          style={[
            styles.lastMessage,
            item.unreadCount > 0 && styles.unreadMessage
          ]}
          numberOfLines={1}
        >
          {getLastMessagePreview()}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default function ChatsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = ChatService.listenToUserChats(user.uid, (userChats) => {
      setChats(userChats);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const handleChatPress = (chatId: string) => {
    router.push(`/chat/${chatId}`);
  };

  const onRefresh = () => {
    setRefreshing(true);
    // The real-time listener will automatically update
    setTimeout(() => setRefreshing(false), 1000);
  };

  const renderChat = ({ item }: { item: ChatListItem }) => (
    <ChatItem item={item} onPress={handleChatPress} />
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading chats...</Text>
      </View>
    );
  }

  if (chats.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyTitle}>No chats yet</Text>
        <Text style={styles.emptySubtitle}>
          Start a conversation with your contacts!
        </Text>
        <TouchableOpacity
          style={styles.contactsButton}
          onPress={() => router.push('/(tabs)/contacts')}
        >
          <Text style={styles.contactsButtonText}>Go to Contacts</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        renderItem={renderChat}
        keyExtractor={(item) => item.chat.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        style={styles.chatList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  contactsButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  contactsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  unreadMessage: {
    fontWeight: '600',
    color: '#333',
  },
});