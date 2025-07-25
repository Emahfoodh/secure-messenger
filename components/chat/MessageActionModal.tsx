import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native"
import type { Message } from "@/types/messageTypes"
import { MessageService } from "@/services/messageService"

interface MessageActionModalProps {
  visible: boolean
  onClose: () => void
  chatId: string
  message: Message | null
  isOwnMessage: boolean
}

export default function MessageActionModal({ visible, onClose, message, isOwnMessage, chatId }: MessageActionModalProps) {
  const handleEdit = () => {
    console.log("Edit message:", message?.id, message?.content)
    onClose()
  }

  const handleDelete = () => {
    if (!message) return
    MessageService.deleteMessage(chatId,message?.id)
    onClose()
  }

  if (!message) return null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Message Actions</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Message Preview */}
          <View style={styles.messagePreview}>
            <Text style={styles.messagePreviewText} numberOfLines={2}>
              {message.content || "Media message"}
            </Text>
          </View>

          <View style={styles.actions}>
            {/* Edit Button - Only show for own messages and text messages */}
            {isOwnMessage && message.type === "text" && (
              <TouchableOpacity style={styles.actionButton} onPress={handleEdit}>
                <View style={styles.actionIcon}>
                  <Text style={styles.iconText}>✏️</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Edit</Text>
                  <Text style={styles.actionSubtitle}>Edit this message</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Delete Button - Only show for own messages */}
            {isOwnMessage && (
              <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
                <View style={[styles.actionIcon, styles.deleteIcon]}>
                  <Text style={styles.iconText}>🗑️</Text>
                </View>
                <View style={styles.actionContent}>
                  <Text style={[styles.actionTitle, styles.deleteText]}>Delete</Text>
                  <Text style={styles.actionSubtitle}>Delete this message</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* If not own message, show info */}
            {!isOwnMessage && (
              <View style={styles.infoContainer}>
                <Text style={styles.infoText}>You can only edit and delete your own messages</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  messagePreview: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  messagePreviewText: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  actions: {
    padding: 20,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  deleteIcon: {
    backgroundColor: "#FF3B30",
  },
  iconText: {
    fontSize: 24,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  deleteText: {
    color: "#FF3B30",
  },
  actionSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  infoContainer: {
    padding: 16,
    backgroundColor: "#fff3cd",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffeaa7",
  },
  infoText: {
    fontSize: 14,
    color: "#856404",
    textAlign: "center",
  },
  cancelButton: {
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 16,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
})
