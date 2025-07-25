"use client";
import { FirebaseMessageService } from "@/services/firebaseMessageService";
import type { Message } from "@/types/messageTypes";
import type React from "react";
import { useEffect, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface MessageActionModalProps {
  visible: boolean;
  onClose: () => void;
  chatId: string;
  message: Message | null;
  isOwnMessage: boolean;
}

const { height: screenHeight } = Dimensions.get("window");

const MessageActionModal: React.FC<MessageActionModalProps> = ({
  visible,
  onClose,
  message,
  isOwnMessage,
  chatId,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedText, setEditedText] = useState("");

  const handleEdit = () => {
    setEditedText(message?.content || "");
    setIsEditMode(true);
  };

  const handleConfirmEdit = () => {
    if (!message || !editedText.trim()) return;
    console.log("Edit confirmed:", {
      messageId: message?.id,
      originalContent: message?.content,
      editedContent: editedText,
    });
    FirebaseMessageService.editMessage(chatId, message.id, editedText);
    setIsEditMode(false);
    setEditedText("");
    onClose();
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedText("");
  };

  const handleDelete = () => {
    if (!message) return;
    FirebaseMessageService.deleteMessage(chatId, message?.id);
    onClose();
  };

  useEffect(() => {
    if (!visible) {
      setIsEditMode(false);
      setEditedText("");
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <View style={styles.header}>
              <Text style={styles.title}>
                {isEditMode ? "Edit Message" : "Message Actions"}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Message Preview - Only show when not in edit mode */}
            {!isEditMode && (
              <View style={styles.messagePreview}>
                <Text style={styles.messagePreviewText} numberOfLines={2}>
                  {message?.content || "Media message"}
                </Text>
              </View>
            )}

            {/* Edit Mode */}
            {isEditMode ? (
              <View style={styles.editContainer}>
                <Text style={styles.editLabel}>Edit your message:</Text>
                <TextInput
                  style={styles.editInput}
                  value={editedText}
                  onChangeText={setEditedText}
                  multiline
                  placeholder="Enter your message..."
                  placeholderTextColor="#999"
                  autoFocus
                  maxLength={1000}
                />
                <Text style={styles.characterCount}>
                  {editedText.length}/1000
                </Text>
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[styles.editButton, styles.cancelEditButton]}
                    onPress={handleCancelEdit}
                  >
                    <Text style={styles.cancelEditButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, styles.confirmButton]}
                    onPress={handleConfirmEdit}
                    disabled={!editedText.trim()}
                  >
                    <Text
                      style={[
                        styles.confirmButtonText,
                        !editedText.trim() && styles.disabledButtonText,
                      ]}
                    >
                      Confirm
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Action Buttons - Only show when not in edit mode */
              <View style={styles.actions}>
                {/* Edit Button - Only show for own messages and text messages */}
                {isOwnMessage && message?.type === "text" && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleEdit}
                  >
                    <View style={styles.actionIcon}>
                      <Text style={styles.iconText}>✏️</Text>
                    </View>
                    <View style={styles.actionContent}>
                      <Text style={styles.actionTitle}>Edit</Text>
                      <Text style={styles.actionSubtitle}>
                        Edit this message
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Delete Button - Only show for own messages */}
                {isOwnMessage && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleDelete}
                  >
                    <View style={[styles.actionIcon, styles.deleteIcon]}>
                      <Text style={styles.iconText}>🗑️</Text>
                    </View>
                    <View style={styles.actionContent}>
                      <Text style={[styles.actionTitle, styles.deleteText]}>
                        Delete
                      </Text>
                      <Text style={styles.actionSubtitle}>
                        Delete this message
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* If not own message, show info */}
                {!isOwnMessage && (
                  <View style={styles.infoContainer}>
                    <Text style={styles.infoText}>
                      You can only edit and delete your own messages
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Cancel Button - Only show when not in edit mode */}
            {!isEditMode && (
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  scrollContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 20,
  },
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "80%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    maxHeight: screenHeight * 0.8, // Limit max height
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: "#666",
  },
  messagePreview: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  messagePreviewText: {
    fontSize: 16,
    color: "#444",
  },
  actions: {
    padding: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  actionSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  deleteIcon: {
    backgroundColor: "#ffebee",
  },
  deleteText: {
    color: "#d32f2f",
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "500",
  },
  infoContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  infoText: {
    fontSize: 14,
    color: "#777",
    textAlign: "center",
  },
  editContainer: {
    padding: 20,
  },
  editLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 100,
    maxHeight: 150, // Reduced max height to ensure buttons are visible
    textAlignVertical: "top",
    backgroundColor: "#f8f9fa",
  },
  characterCount: {
    fontSize: 12,
    color: "#666",
    textAlign: "right",
    marginTop: 8,
    marginBottom: 16,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
  },
  editButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelEditButton: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  confirmButton: {
    backgroundColor: "#007AFF",
  },
  cancelEditButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  disabledButtonText: {
    color: "rgba(255, 255, 255, 0.5)",
  },
});

export default MessageActionModal;
