"use client";

import MessageItem from "@/components/chat/MessageItem";
import MessageActionModal from "@/components/chat/MessageActionModal";
import ImagePickerModal from "@/components/media/ImagePickerModal";
import VideoPickerModal from "@/components/media/VideoPickerModal";
import { useAuth } from "@/context/AuthContext";
import { ChatService } from "@/services/chatService";
import { isContact } from "@/services/contactService";
import { ErrorService } from "@/services/errorService";
import {
  MessageService,
  type MessagesPaginationResult,
} from "@/services/messageService";
import { getUserProfile, type UserProfile } from "@/services/userService";
import type {
  Chat,
  Message,
  MessageStatus,
  MessageType,
  SendMessageData,
} from "@/types/messageTypes";
import type * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function ChatScreen() {
  const { id: chatId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isContactValid, setIsContactValid] = useState(true);
  const [checkingContact, setCheckingContact] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [sendingVideo, setSendingVideo] = useState(false);

  // Message action modal state
  const [showMessageActionModal, setShowMessageActionModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // user and other participant details
  const [otherParticipant, setOtherParticipant] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Pagination states
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [lastDoc, setLastDoc] = useState<
    QueryDocumentSnapshot<DocumentData> | undefined
  >();

  const flatListRef = useRef<FlatList>(null);

  // Handle message long press
  const handleMessageLongPress = (message: Message) => {
    if (
      message.senderId !== user?.uid ||
      message.status === "deleted" ||
      message.type !== "text"
    )
      return;
    setSelectedMessage(message);
    setShowMessageActionModal(true);
  };

  const closeMessageActionModal = () => {
    setShowMessageActionModal(false);
    setSelectedMessage(null);
  };

  // Main initialization effect
  useEffect(() => {
    if (!chatId || !user) return;

    const initializeChat = async () => {
      try {
        // First load chat details
        const chatData = await ChatService.getChatById(chatId);
        setChat(chatData);

        // Then check contact status
        if (chatData) {
          await checkContactStatusWithData(chatData);
        }

        const userProfileData = await getUserProfile(user.uid);
        if (userProfileData) {
          setUserProfile(userProfileData);
        }

        await loadOlderMessages();
        await MessageService.markOtherUsersMessagesAsRead(chatId, user.uid);
      } catch (error) {
        console.error("Error initializing chat:", error);
        ErrorService.handleError(error, "Load Chat");
      } finally {
        // Always set loading to false, even if there's an error
        setLoading(false);
      }
    };

    initializeChat();

    const unsubscribe = MessageService.listenForMessages(
      chatId,
      user.uid,
      // Callback for new messages
      (message) => {
        setMessages((prevMessages) => {
          // Check if message already exists (for new messages)
          const existingIndex = prevMessages.findIndex(
            (m) => m.id === message.id
          );
          if (existingIndex === -1) {
            // New message - add it
            return [message, ...prevMessages].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
            );
          }
          return prevMessages;
        });
        MessageService.markMessageAsRead(chatId, user.uid, message.id);
      },
      // Callback for status changes
      (messageId, newStatus, updatedMessage) => {
        tryUpdateMessage(messageId, newStatus, updatedMessage);
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const tryUpdateMessage = (
    messageId: string,
    newStatus: MessageStatus,
    updatedMessage: Message,
    maxRetries = 10,
    delay = 500 // ms
  ): void => {
    let attempts = 0;

    const update = (): void => {
      let found = false;
      setMessages((prevMessages: Message[]): Message[] => {
        const newMessages = prevMessages.map((msg: Message): Message => {
          if (msg.id === messageId) {
            found = true;
            return { ...updatedMessage, status: newStatus };
          }
          return msg;
        });
        return newMessages;
      });

      if (!found && attempts < maxRetries) {
        attempts++;
        setTimeout(update, delay);
      }
    };

    update();
  };

  // Separate function to check contact status with chat data
  const checkContactStatusWithData = async (chatData: Chat) => {
    if (!user) return;

    setCheckingContact(true);
    try {
      const otherParticipant = chatData.participantDetails.find(
        (p) => p.uid !== user.uid
      );
      if (!otherParticipant) {
        console.log("No other participant found");
        setIsContactValid(false);
        return;
      }

      setOtherParticipant(otherParticipant);
      const stillContacts = await isContact(user.uid, otherParticipant.uid);
      setIsContactValid(stillContacts);
    } catch (error) {
      console.error("Error checking contact status:", error);
      setIsContactValid(true); // Default to true on error
    } finally {
      setCheckingContact(false);
    }
  };

  // Load older messages when user scrolls to bottom (in inverted list)
  const loadOlderMessages = useCallback(async () => {
    if (!chatId || !hasMoreMessages || loadingOlderMessages) return;

    setLoadingOlderMessages(true);
    try {
      const result: MessagesPaginationResult =
        await MessageService.loadOlderMessages(chatId, lastDoc);

      if (result.messages.length > 0) {
        setMessages((prevMessages) => {
          const newMessages = [...result.messages, ...prevMessages];
          // Sort messages by timestamp to maintain order
          return newMessages.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
        setLastDoc(result.lastDoc);
      }

      setHasMoreMessages(result.hasMore);
    } catch (error) {
      ErrorService.handleError(error, "Load Older Messages");
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [chatId, lastDoc, hasMoreMessages, loadingOlderMessages]);

  const sendMessage = async () => {
    if (!inputText.trim() || !user || !chatId || sending) return;

    const messageContent = inputText.trim();
    setInputText("");
    await sendMessageToServer("text", messageContent);
  };

  const sendMessageToServer = async (
    type: MessageType,
    messageContent?: string,
    image?: ImagePicker.ImagePickerAsset,
    video?: ImagePicker.ImagePickerAsset
  ) => {
    if (!user || !chatId || sending || sendingImage || sendingVideo) return;

    if (!isContactValid) {
      Alert.alert(
        "Cannot Send Message",
        "You can only send messages to your contacts. This person is no longer in your contacts list.",
        [{ text: "OK" }]
      );
      return;
    }

    setSending(true);
    let tempId: string;

    try {
      const senderUsername = userProfile?.username || user.email || "User";

      // Create a temporary message to show immediately
      tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempMessage: Message = {
        id: tempId, // More unique temporary ID
        chatId,
        senderId: user.uid,
        senderUsername,
        ...(messageContent ? { content: messageContent } : {}),
        type,
        timestamp: new Date().toISOString(),
        status: "sending",
        isEncrypted: chat?.isSecretChat || chat?.encryptionEnabled || false,
        ...(image
          ? {
              imageData: {
                uri: image.uri,
                width: image.width,
                height: image.height,
                size: image.fileSize || 0,
                downloadURL: image.uri,
              },
            }
          : {}),
        ...(video
          ? {
              videoData: {
                uri: video.uri,
                width: video.width,
                height: video.height,
                size: video.fileSize || 0,
                duration: video.duration || 0,
                downloadURL: video.uri, // Use local URI as temporary downloadURL
              },
            }
          : {}),
      };

      // Add temporary message to the UI
      let messagesCopy = [tempMessage, ...messages];
      setMessages(messagesCopy);

      // 🔐 Send message (encryption handled automatically in MessageService)
      const messageId = await MessageService.sendMessage(
        chatId,
        user.uid,
        otherParticipant.uid,
        tempMessage as SendMessageData
      );

      const updatedMessage: Message = {
        ...tempMessage,
        id: messageId, // Update with real ID from server
        status: "sent", // Update status to sent
      };

      messagesCopy = messagesCopy.map((msg) =>
        msg.id === tempId ? updatedMessage : msg
      );

      // Update the temporary message with the real ID and sent status
      setMessages(messagesCopy);
    } catch (error) {
      // Remove the temporary message on error
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== tempId)
      );
      ErrorService.handleError(error, "Send Message");
      if (messageContent) {
        setInputText(messageContent);
      }
    } finally {
      setSendingImage(false);
      setSendingVideo(false);
      setSending(false);
    }
  };

  const handleImageSelected = async (image: ImagePicker.ImagePickerAsset) => {
    if (!user || !chatId || sendingImage) return;
    setSendingImage(true);
    await sendMessageToServer("image", undefined, image);
    setSendingImage(false);
  };

  const handleVideoSelected = async (video: ImagePicker.ImagePickerAsset) => {
    if (!user || !chatId || sendingVideo) return;
    setSendingVideo(true);
    await sendMessageToServer("video", undefined, undefined, video);
    setSendingVideo(false);
  };

  // Optimized render function with keyExtractor
  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const isOwnMessage = item.senderId === user?.uid;
      return (
        <MessageItem
          message={item}
          isOwnMessage={isOwnMessage}
          onLongPress={handleMessageLongPress}
        />
      );
    },
    [messages, user]
  );

  // Handle reaching end (which is bottom in inverted list) for pagination
  const handleEndReached = useCallback(() => {
    if (hasMoreMessages && !loadingOlderMessages) {
      loadOlderMessages();
    }
  }, [hasMoreMessages, loadingOlderMessages, loadOlderMessages]);

  // 🔐 Get encryption status info
  const getEncryptionInfo = () => {
    if (!chat) return null;

    if (chat.isSecretChat) {
      return {
        isEncrypted: true,
        label: "Secret Chat",
        icon: "🔒",
        description: "Messages are end-to-end encrypted",
      };
    } else if (chat.encryptionEnabled) {
      return {
        isEncrypted: true,
        label: "Encrypted",
        icon: "🔐",
        description: "Messages are encrypted",
      };
    }

    return {
      isEncrypted: false,
      label: "Regular Chat",
      icon: "💬",
      description: "Standard messaging",
    };
  };

  const encryptionInfo = getEncryptionInfo();

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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Chat Header - UPDATED WITH ENCRYPTION STATUS */}
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
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>
                {otherParticipant?.displayName || otherParticipant?.username}
              </Text>
              {/* 🔐 Encryption indicator */}
              {encryptionInfo && (
                <View style={styles.encryptionBadge}>
                  <Text style={styles.encryptionIcon}>
                    {encryptionInfo.icon}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.headerSubtitle}>
              @{otherParticipant?.username}
            </Text>
            {/* 🔐 Encryption status text */}
            {encryptionInfo && encryptionInfo.isEncrypted && (
              <Text style={styles.encryptionStatus}>
                {encryptionInfo.description}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* 🔐 Secret chat notification banner */}
      {chat?.isSecretChat && (
        <View style={styles.secretChatBanner}>
          <Text style={styles.secretChatText}>
            🔒 This is a secret chat. Messages are end-to-end encrypted.
          </Text>
        </View>
      )}

      {/* Messages List with Pagination - INVERTED */}
      <View style={styles.messagesContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id || `temp-${item.timestamp}`}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          inverted={true}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.1}
          ListFooterComponent={
            loadingOlderMessages ? (
              <View style={styles.loadingOlderContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingOlderText}>
                  Loading older messages...
                </Text>
              </View>
            ) : null
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={10}
          initialNumToRender={15}
        />
      </View>

      {/* Contact Status Warning */}
      {!isContactValid && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>
            ⚠️ This person is no longer in your contacts. You cannot send new
            messages.
          </Text>
          <TouchableOpacity
            style={styles.addContactButton}
            onPress={() => router.push("/(tabs)/contacts")}
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
              {sendingImage ? "⏳" : "📷"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mediaButton}
            onPress={() => setShowVideoPicker(true)}
            disabled={sendingImage || sendingVideo}
          >
            <Text style={styles.mediaButtonText}>
              {sendingVideo ? "⏳" : "🎥"}
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder={
              encryptionInfo?.isEncrypted
                ? "Type an encrypted message..."
                : "Type a message..."
            }
            placeholderTextColor="#999"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>{sending ? "⏳" : "→"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.disabledInputContainer}>
          <Text style={styles.disabledInputText}>
            Messaging is disabled - not in contacts
          </Text>
        </View>
      )}

      {/* Message Action Modal */}
      <MessageActionModal
        visible={showMessageActionModal}
        onClose={closeMessageActionModal}
        chatId={chatId}
        message={selectedMessage}
        isOwnMessage={selectedMessage?.senderId === user?.uid}
      />

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
            {sendingImage
              ? "Processing and sending image..."
              : "Processing and sending video..."}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
    paddingTop: 60,
  },
  backButton: {
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 24,
    color: "#007AFF",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerAvatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  headerText: {
    flex: 1,
  },
  // 🔐 Encryption indicator styles
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  encryptionBadge: {
    marginLeft: 8,
  },
  encryptionIcon: {
    fontSize: 16,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  encryptionStatus: {
    fontSize: 12,
    color: "#34C759",
    fontWeight: "500",
    marginTop: 2,
  },
  // 🔐 Secret chat banner
  secretChatBanner: {
    backgroundColor: "#fff3e0",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ffcc02",
  },
  secretChatText: {
    fontSize: 12,
    color: "#b8860b",
    textAlign: "center",
    fontWeight: "500",
  },
  messagesContainer: {
    flex: 1,
  },
  loadingOlderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "#f8f9fa",
  },
  loadingOlderText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#666",
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    backgroundColor: "#fff",
  },
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  mediaButtonText: {
    fontSize: 16,
    color: "#fff",
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
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
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#ccc",
  },
  sendButtonText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "bold",
  },
  warningContainer: {
    backgroundColor: "#fff3cd",
    borderTopWidth: 1,
    borderTopColor: "#ffeaa7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  warningText: {
    fontSize: 14,
    color: "#856404",
    textAlign: "center",
    marginBottom: 8,
  },
  addContactButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addContactButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledInputContainer: {
    backgroundColor: "#f8f9fa",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  disabledInputText: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  sendingMediaOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  sendingMediaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
});
