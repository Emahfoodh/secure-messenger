// app/(tabs)/contacts.tsx

import { useAuth } from "@/context/AuthContext";
import ContactRequestsScreen from "@/screens/contact/ContactRequestsScreen";
import QRScannerScreen from "@/screens/contact/QRScannerScreen";
import UserSearchScreen from "@/screens/contact/UserSearchScreen";
import { Contact, getContacts, removeContact } from "@/services/contactService";
import { ErrorService } from "@/services/errorService";
import { firebaseChatService } from "@/services/firebaseChatService";
import { getUserProfile } from "@/services/userService";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type TabType = "contacts" | "requests" | "search" | "scan";

interface ContactItemProps {
  contact: Contact;
  onRemove: (contact: Contact) => void;
  onStartChat: (contact: Contact, isSecret?: boolean) => void; // 🔐 isSecret parameter
  loading: boolean;
}

const ContactItem: React.FC<ContactItemProps> = ({
  contact,
  onRemove,
  onStartChat,
  loading,
}) => {
  const [showChatOptions, setShowChatOptions] = useState(false); // 🔐 Show chat type options

  const handleRemove = () => {
    Alert.alert(
      "Remove Contact",
      `Are you sure you want to remove ${contact.username} from your contacts?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onRemove(contact),
        },
      ]
    );
  };

  // 🔐 Show chat type selection modal
  const ChatOptionsModal = () => (
    <Modal
      visible={showChatOptions}
      transparent
      animationType="slide"
      onRequestClose={() => setShowChatOptions(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            Start Chat with {contact.username}
          </Text>

          <TouchableOpacity
            style={[styles.chatOptionButton, styles.regularChatButton]}
            onPress={() => {
              setShowChatOptions(false);
              onStartChat(contact, false);
            }}
            disabled={loading}
          >
            <Text style={styles.chatOptionIcon}>💬</Text>
            <View style={styles.chatOptionTextContainer}>
              <Text style={styles.chatOptionTitle}>Regular Chat</Text>
              <Text style={styles.chatOptionDescription}>
                Standard messaging with cloud backup
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chatOptionButton, styles.secretChatButton]}
            onPress={() => {
              setShowChatOptions(false);
              onStartChat(contact, true);
            }}
            disabled={loading}
          >
            <Text style={styles.chatOptionIcon}>🔒</Text>
            <View style={styles.chatOptionTextContainer}>
              <Text style={styles.chatOptionTitle}>Secret Chat</Text>
              <Text style={styles.chatOptionDescription}>
                End-to-end encrypted messaging
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowChatOptions(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.contactItem}>
      <View style={styles.contactInfo}>
        {contact.profilePicture ? (
          <Image
            source={{ uri: contact.profilePicture }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {contact.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.contactDetails}>
          <Text style={styles.username}>{contact.username}</Text>
          {contact.displayName && (
            <Text style={styles.displayName}>{contact.displayName}</Text>
          )}
        </View>
      </View>

      <View style={styles.contactActions}>
        {/* 🔐 Changed to show chat options */}
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => setShowChatOptions(true)}
          disabled={loading}
        >
          <Text style={styles.chatButtonText}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
          <Text style={styles.removeButtonText}>Remove</Text>
        </TouchableOpacity>
      </View>

      {/* 🔐 Chat options modal */}
      <ChatOptionsModal />
    </View>
  );
};

export default function ContactsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("contacts");
  const [scannerVisible, setScannerVisible] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const userContacts = await getContacts(user.uid);
      setContacts(userContacts);
    } catch (error) {
      ErrorService.handleError(error, "Contacts");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveContact = async (contact: Contact) => {
    if (!user) return;

    try {
      await removeContact(user.uid, contact.uid);
      Alert.alert("Success", `${contact.username} removed from contacts`);
      await loadContacts();
    } catch (error) {
      ErrorService.handleError(error, "Remove Contact");
    }
  };

  // 🔐 Handle both regular and secret chat creation
  const handleStartChat = async (
    contact: Contact,
    isSecret: boolean = false
  ) => {
    if (!user || creatingChat) return;

    setCreatingChat(true);
    try {
      // Get current user profile
      const currentUserProfile = await getUserProfile(user.uid);
      if (!currentUserProfile) {
        Alert.alert("Error", "Could not load your profile");
        return;
      }

      // Create appropriate chat type
      const chatId = isSecret
        ? await firebaseChatService.createSecretChat(
            currentUserProfile,
            contact
          )
        : await firebaseChatService.createChat(currentUserProfile, contact);

      // Show confirmation for secret chats
      if (isSecret) {
        Alert.alert(
          "🔒 Secret Chat Created",
          `Your secret chat with ${contact.username} is now encrypted end-to-end. Messages will be secured with encryption.`,
          [
            {
              text: "Start Chatting",
              onPress: () => router.push(`/chat/${chatId}`),
            },
          ]
        );
      } else {
        // Navigate to regular chat immediately
        router.push(`/chat/${chatId}`);
      }
    } catch (error) {
      ErrorService.handleError(error, "Start Chat");
    } finally {
      setCreatingChat(false);
    }
  };

  const handleQRScan = () => {
    setScannerVisible(true);
  };

  const handleQRScanComplete = () => {
    setScannerVisible(false);
    // Refresh contacts after successful scan
    loadContacts();
  };

  const renderContact = ({ item }: { item: Contact }) => (
    <ContactItem
      contact={item}
      onRemove={handleRemoveContact}
      onStartChat={handleStartChat}
      loading={creatingChat}
    />
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "contacts":
        return (
          <View style={styles.tabContent}>
            {loading ? (
              <View style={styles.centerContainer}>
                <Text>Loading contacts...</Text>
              </View>
            ) : contacts.length === 0 ? (
              <View style={styles.centerContainer}>
                <Text style={styles.noContactsText}>No contacts yet</Text>
                <Text style={styles.noContactsSubtext}>
                  Send contact requests to connect with others
                </Text>
              </View>
            ) : (
              <FlatList
                data={contacts}
                renderItem={renderContact}
                keyExtractor={(item) => item.uid}
                style={styles.contactsList}
              />
            )}
          </View>
        );
      case "requests":
        return <ContactRequestsScreen />;
      case "search":
        return <UserSearchScreen />;
      case "scan":
        return (
          <View style={styles.scanContainer}>
            <Text style={styles.scanTitle}>QR Code Scanner</Text>
            <Text style={styles.scanSubtitle}>
              Scan a user's QR code to send them a contact request
            </Text>
            <TouchableOpacity style={styles.scanButton} onPress={handleQRScan}>
              <Text style={styles.scanButtonText}>Open Scanner</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "contacts" && styles.activeTab]}
          onPress={() => {
            loadContacts();
            setActiveTab("contacts");
          }}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "contacts" && styles.activeTabText,
            ]}
          >
            Contacts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "requests" && styles.activeTab]}
          onPress={() => setActiveTab("requests")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "requests" && styles.activeTabText,
            ]}
          >
            Requests
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "search" && styles.activeTab]}
          onPress={() => setActiveTab("search")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "search" && styles.activeTabText,
            ]}
          >
            Search
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "scan" && styles.activeTab]}
          onPress={() => setActiveTab("scan")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "scan" && styles.activeTabText,
            ]}
          >
            Scan QR
          </Text>
        </TouchableOpacity>
      </View>

      {renderTabContent()}

      <Modal
        visible={scannerVisible}
        animationType="slide"
        onRequestClose={() => setScannerVisible(false)}
      >
        <QRScannerScreen
          onClose={() => setScannerVisible(false)}
          onScanComplete={handleQRScanComplete}
        />
      </Modal>

      {creatingChat && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingOverlayText}>
            {creatingChat ? "Starting chat..." : "Processing..."}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: "#007AFF",
  },
  tabText: {
    fontSize: 14,
    color: "#666",
  },
  activeTabText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  tabContent: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  noContactsText: {
    fontSize: 18,
    color: "#666",
    marginBottom: 8,
  },
  noContactsSubtext: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  contactsList: {
    flex: 1,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  contactInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  contactDetails: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  displayName: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  contactActions: {
    flexDirection: "row",
  },
  chatButton: {
    backgroundColor: "#34C759",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  chatButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  removeButton: {
    backgroundColor: "#ff3b30",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  scanContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  scanTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  scanSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
  },
  scanButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlayText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // 🔐 Modal styles for chat options
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#333",
  },
  chatOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  regularChatButton: {
    backgroundColor: "#f8f9fa",
    borderColor: "#e9ecef",
  },
  secretChatButton: {
    backgroundColor: "#fff3e0",
    borderColor: "#ffcc02",
  },
  chatOptionIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  chatOptionTextContainer: {
    flex: 1,
  },
  chatOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  chatOptionDescription: {
    fontSize: 14,
    color: "#666",
  },
  cancelButton: {
    padding: 16,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
});
