import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  Modal,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getContacts, removeContact, Contact } from '@/services/contactService';
import UserSearchScreen from '@/screens/UserSearchScreen';
import QRScannerScreen from '@/screens/QRScannerScreen';
import ContactRequestsScreen from '@/screens/ContactRequestsScreen';
import { reload } from 'expo-router/build/global-state/routing';

type TabType = 'contacts' | 'requests' | 'search' | 'scan';

interface ContactItemProps {
  contact: Contact;
  onRemove: (contact: Contact) => void;
}

const ContactItem: React.FC<ContactItemProps> = ({ contact, onRemove }) => {
  const handleRemove = () => {
    Alert.alert(
      'Remove Contact',
      `Are you sure you want to remove ${contact.username} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onRemove(contact) },
      ]
    );
  };

  return (
    <View style={styles.contactItem}>
      <View style={styles.contactInfo}>
        {contact.profilePicture ? (
          <Image source={{ uri: contact.profilePicture }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{contact.username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.contactDetails}>
          <Text style={styles.username}>{contact.username}</Text>
          {contact.displayName && <Text style={styles.displayName}>{contact.displayName}</Text>}
        </View>
      </View>
      
      <TouchableOpacity
        style={styles.removeButton}
        onPress={handleRemove}
      >
        <Text style={styles.removeButtonText}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function ContactsScreen() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('contacts');
  const [scannerVisible, setScannerVisible] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    if (!user) return;
    
    setLoading(true);
    const userContacts = await getContacts(user.uid);
    setContacts(userContacts);
    setLoading(false);
  };

  const handleRemoveContact = async (contact: Contact) => {
    if (!user) return;

    const success = await removeContact(user.uid, contact.uid);
    if (success) {
      Alert.alert('Success', `${contact.username} removed from contacts`);
      await loadContacts();
    } else {
      Alert.alert('Error', 'Failed to remove contact');
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
    />
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'contacts':
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
      case 'requests':
        return <ContactRequestsScreen />;
      case 'search':
        return <UserSearchScreen />;
      case 'scan':
        return (
          <View style={styles.scanContainer}>
            <Text style={styles.scanTitle}>QR Code Scanner</Text>
            <Text style={styles.scanSubtitle}>
              Scan a user's QR code to send them a contact request
            </Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={handleQRScan}
            >
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
          style={[styles.tab, activeTab === 'contacts' && styles.activeTab]}
          onPress={() => {
            loadContacts()
            setActiveTab('contacts')
          }}
        >
          <Text style={[styles.tabText, activeTab === 'contacts' && styles.activeTabText]}>
            Contacts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
            Requests
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
            Search
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'scan' && styles.activeTab]}
          onPress={() => setActiveTab('scan')}
        >
          <Text style={[styles.tabText, activeTab === 'scan' && styles.activeTabText]}>
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
    </View>
  );
}

// Keep the same styles as before, just add the new tab styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14, // Smaller text due to more tabs
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noContactsText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  noContactsSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  contactsList: {
    flex: 1,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactDetails: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  displayName: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  removeButton: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scanContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scanTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  scanSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  scanButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});