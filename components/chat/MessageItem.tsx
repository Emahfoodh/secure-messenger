import type React from "react";
import { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { Message } from "@/types/messageTypes";
import ImageMessage from "@/components/media/ImageMessage";
import VideoMessage from "@/components/media/VideoMessage";

interface MessageItemProps {
  message: Message;
  isOwnMessage: boolean;
  onLongPress: (message: Message) => void;
}

const MessageItem: React.FC<MessageItemProps> = memo(
  ({ message, isOwnMessage, onLongPress }) => {
    const formatTime = (timestamp: string) => {
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    };

    const getStatusIcon = () => {
      // Only show status for our own messages
      if (!isOwnMessage) return "";

      switch (message.status) {
        case "sending":
          return "⏳";
        case "sent":
          return "✓";
        case "read":
          return "✓✓";
        case "deleted":
          return "❌";
        default:
          return "";
      }
    };

    const getStatusColor = () => {
      switch (message.status) {
        case "read":
          return "#34C759"; // Green for read
        case "sent":
          return "rgba(255,255,255,0.7)"; // Light for sent
        case "sending":
          return "rgba(255,255,255,0.5)"; // Very light for sending
        case "deleted":
          return "#FF3B30"; // Red for deleted
        default:
          return "rgba(255,255,255,0.7)";
      }
    };

    const handleLongPress = () => {
      onLongPress(message);
    };

    // Handle video messages
    if (message.type === "video" && message.videoData) {
      return (
        <View
          style={[
            styles.messageContainer,
            isOwnMessage
              ? styles.ownMessageContainer
              : styles.otherMessageContainer,
          ]}
        >
          <TouchableOpacity
            style={styles.videoMessageWrapper}
            onLongPress={handleLongPress}
            delayLongPress={500}
          >
            <VideoMessage
              videoData={message.videoData}
              isOwnMessage={isOwnMessage}
              timestamp={message.timestamp}
              status={message.status}
            />
            {/* Show caption if exists */}
            {message.content && (
              <View
                style={[
                  styles.captionBubble,
                  isOwnMessage
                    ? styles.ownCaptionBubble
                    : styles.otherCaptionBubble,
                ]}
              >
                <Text
                  style={[
                    styles.captionText,
                    isOwnMessage
                      ? styles.ownCaptionText
                      : styles.otherCaptionText,
                  ]}
                >
                  {message.content}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    // Handle image messages
    if (message.type === "image" && message.imageData) {
      return (
        <View
          style={[
            styles.messageContainer,
            isOwnMessage
              ? styles.ownMessageContainer
              : styles.otherMessageContainer,
          ]}
        >
          <TouchableOpacity
            style={styles.imageMessageWrapper}
            onLongPress={handleLongPress}
            delayLongPress={500}
          >
            <ImageMessage
              imageData={message.imageData}
              isOwnMessage={isOwnMessage}
              timestamp={message.timestamp}
              status={message.status}
            />
            {/* Show caption if exists */}
            {message.content && (
              <View
                style={[
                  styles.captionBubble,
                  isOwnMessage
                    ? styles.ownCaptionBubble
                    : styles.otherCaptionBubble,
                ]}
              >
                <Text
                  style={[
                    styles.captionText,
                    isOwnMessage
                      ? styles.ownCaptionText
                      : styles.otherCaptionText,
                  ]}
                >
                  {message.content}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    // Handle text messages
    return (
      <View
        style={[
          styles.messageContainer,
          isOwnMessage
            ? styles.ownMessageContainer
            : styles.otherMessageContainer,
        ]}
      >
        <TouchableOpacity
          style={[
            styles.messageBubble,
            isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble,
          ]}
          onLongPress={handleLongPress}
          delayLongPress={500}
        >
          <Text
            style={[
              styles.messageText,
              isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
            ]}
          >
            {message.content}
          </Text>
          {message.editedAt && <Text style={styles.editedText}>edited</Text>}
          <View style={styles.messageFooter}>
            <Text
              style={[
                styles.timestamp,
                isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp,
              ]}
            >
              {formatTime(message.timestamp)}
            </Text>
            {isOwnMessage && (
              <Text style={[styles.statusIcon, { color: getStatusColor() }]}>
                {getStatusIcon()}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for React.memo
    // Only re-render if these specific props change
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.status === nextProps.message.status &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.editedAt === nextProps.message.editedAt &&
      prevProps.isOwnMessage === nextProps.isOwnMessage
    );
  }
);

MessageItem.displayName = "MessageItem";

const styles = StyleSheet.create({
  messageContainer: {
    flexDirection: "row",
    marginVertical: 2,
    paddingHorizontal: 16,
  },
  ownMessageContainer: {
    justifyContent: "flex-end",
  },
  otherMessageContainer: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginVertical: 1,
  },
  ownMessageBubble: {
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: "#f0f0f0",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: "#fff",
  },
  otherMessageText: {
    color: "#333",
  },
  editedText: {
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
    marginTop: 2,
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    flex: 1,
  },
  ownTimestamp: {
    color: "rgba(255,255,255,0.7)",
  },
  otherTimestamp: {
    color: "#999",
  },
  statusIcon: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: "bold",
  },
  // Image/Video message specific styles
  imageMessageWrapper: {
    maxWidth: "75%",
  },
  videoMessageWrapper: {
    maxWidth: "75%",
  },
  captionBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 4,
  },
  ownCaptionBubble: {
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  otherCaptionBubble: {
    backgroundColor: "#f0f0f0",
    borderBottomLeftRadius: 4,
  },
  captionText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownCaptionText: {
    color: "#fff",
  },
  otherCaptionText: {
    color: "#333",
  },
});

export default MessageItem;
