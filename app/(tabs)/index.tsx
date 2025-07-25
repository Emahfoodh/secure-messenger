// app/(tabs)/index.tsx

import { useAuth } from "@/context/AuthContext";
import { firebaseChatService } from "@/services/firebaseChatService";
import { ChatListItem } from "@/types/messageTypes";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ChatItemProps {
  item: ChatListItem;
  onPress: (item: ChatListItem) => void;
}

const ChatItem: React.FC<ChatItemProps> = ({ item, onPress }) => {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 24) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else if (diffInDays < 7) {
      return date.toLocaleDateString("en-US", { weekday: "short" });
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const getLastMessagePreview = () => {
    if (!item.lastMessage) {
      return "No messages yet";
    }

    const { content, isOwnMessage, senderUsername, isEncrypted } =
      item.lastMessage;

    // 🔐 Handle encrypted message previews
    let preview = content;
    if (isEncrypted && content === "🔒 Encrypted message") {
      preview = "🔒 Encrypted message";
    } else {
      preview =
        content.length > 50 ? `${content.substring(0, 50)}...` : content;
    }

    if (isOwnMessage) {
      return `You: ${preview}`;
    } else {
      return preview;
    }
  };

  // 🔐 Get encryption icon for chat
  const getEncryptionIcon = () => {
    if (item.chat.isSecretChat) {
      return "🔒"; // Secret chat
    } else if (item.chat.encryptionEnabled) {
      return "🔐"; // Encrypted chat
    }
    return null; // Regular chat
  };

  const encryptionIcon = getEncryptionIcon();

  return (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => onPress(item)}
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
              {item.unreadCount > 99 ? "99+" : item.unreadCount}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <View style={styles.chatNameContainer}>
            <Text style={styles.chatName}>
              {item.otherParticipant.displayName ||
                item.otherParticipant.username}
            </Text>
            {/* 🔐 Encryption indicator */}
            {encryptionIcon && (
              <Text style={styles.encryptionIndicator}>{encryptionIcon}</Text>
            )}
          </View>
          <Text style={styles.timestamp}>
            {item.lastMessage ? formatTime(item.lastMessage.timestamp) : ""}
          </Text>
        </View>

        <View style={styles.messagePreviewContainer}>
          <Text
            style={[
              styles.lastMessage,
              item.unreadCount > 0 && styles.unreadMessage,
              // 🔐 Style encrypted message previews differently
              item.lastMessage?.isEncrypted && styles.encryptedMessage,
            ]}
            numberOfLines={1}
          >
            {getLastMessagePreview()}
          </Text>
          {/* 🔐 Show encryption badge for encrypted chats */}
          {item.chat.isSecretChat && (
            <View style={styles.secretChatBadge}>
              <Text style={styles.secretChatBadgeText}>SECRET</Text>
            </View>
          )}
        </View>
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

    const unsubscribe = firebaseChatService.listenToUserChats(
      user.uid,
      (userChats) => {
        // 🔐 Sort chats to show secret chats prominently if needed
        const sortedChats = userChats.sort((a, b) => {
          // First sort by secret chat status (secret chats first)
          if (a.chat.isSecretChat && !b.chat.isSecretChat) return -1;
          if (!a.chat.isSecretChat && b.chat.isSecretChat) return 1;

          // Then sort by last activity
          return (
            new Date(b.chat.lastActivity).getTime() -
            new Date(a.chat.lastActivity).getTime()
          );
        });

        setChats(sortedChats);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const handleChatPress = (item: ChatListItem) => {
    item.unreadCount = 0;
    router.push(`/chat/${item.chat.id}`);
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
        <Text style={styles.emptyHint}>
          💡 Tip: You can create regular chats or secure secret chats
        </Text>
        <TouchableOpacity
          style={styles.contactsButton}
          onPress={() => router.push("/(tabs)/contacts")}
        >
          <Text style={styles.contactsButtonText}>Go to Contacts</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 🔐 Header with encryption info */}
      <View style={styles.headerInfo}>
        <Text style={styles.headerInfoText}>
          🔒 Secret chats use end-to-end encryption for maximum security
        </Text>
      </View>

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
    backgroundColor: "#fff",
  },
  // 🔐 Header info styles
  headerInfo: {
    backgroundColor: "#f0f8ff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerInfoText: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 10,
  },
  // 🔐 Encryption hint
  emptyHint: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 30,
    fontStyle: "italic",
  },
  contactsButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  contactsButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    // 🔐 Add slight background for secret chats
    backgroundColor: "#fff",
  },
  avatarContainer: {
    position: "relative",
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
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  unreadBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#ff3b30",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  // 🔐 Chat name container with encryption indicator
  chatNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  // 🔐 Encryption indicator styles
  encryptionIndicator: {
    fontSize: 14,
    marginLeft: 4,
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
  },
  // 🔐 Message preview container
  messagePreviewContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastMessage: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  unreadMessage: {
    fontWeight: "600",
    color: "#333",
  },
  // 🔐 Encrypted message styling
  encryptedMessage: {
    fontStyle: "italic",
    color: "#34C759",
  },
  // 🔐 Secret chat badge
  secretChatBadge: {
    backgroundColor: "#ffcc02",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  secretChatBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#8b7500",
  },
});
