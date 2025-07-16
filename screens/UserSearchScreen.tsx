import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { searchUsersByUsername, UserProfile, getUserProfile } from '@/services/userService';
import { 
  sendContactRequest, 
  isContact, 
  checkExistingRequest 
} from '@/services/contactService';

interface UserSearchItemProps {
  user: UserProfile;
  onSendRequest: (user: UserProfile) => void;
  isSendingRequest: boolean;
  buttonState: 'send' | 'sent' | 'contact' | 'incoming';
}

const UserSearchItem: React.FC<UserSearchItemProps> = ({ 
  user, 
  onSendRequest, 
  isSendingRequest, 
  buttonState 
}) => {
  const getButtonConfig = () => {
    switch (buttonState) {
      case 'send':
        return {
          text: isSendingRequest ? 'Sending...' : 'Send Request',
          disabled: isSendingRequest,
          style: styles.sendButton,
          textStyle: styles.sendButtonText,
        };
      case 'sent':
        return {
          text: 'Request Sent',
          disabled: true,
          style: styles.sentButton,
          textStyle: styles.sentButtonText,
        };
      case 'contact':
        return {
          text: 'Contact',
          disabled: true,
          style: styles.contactButton,
          textStyle: styles.contactButtonText,
        };
      case 'incoming':
        return {
          text: 'Check Requests',
          disabled: true,
          style: styles.incomingButton,
          textStyle: styles.incomingButtonText,
        };
      default:
        return {
          text: 'Send Request',
          disabled: false,
          style: styles.sendButton,
          textStyle: styles.sendButtonText,
        };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        {user.profilePicture ? (
          <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{user.username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.userDetails}>
          <Text style={styles.username}>{user.username}</Text>
          {user.displayName && <Text style={styles.displayName}>{user.displayName}</Text>}
        </View>
      </View>
      
      <TouchableOpacity
        style={[styles.actionButton, buttonConfig.style]}
        onPress={() => buttonState === 'send' ? onSendRequest(user) : null}
        disabled={buttonConfig.disabled}
      >
        <Text style={buttonConfig.textStyle}>
          {buttonConfig.text}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default function UserSearchScreen() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingRequest, setSendingRequest] = useState<string | null>(null);
  const [buttonStates, setButtonStates] = useState<{ [key: string]: 'send' | 'sent' | 'contact' | 'incoming' }>({});

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setButtonStates({});
      return;
    }

    setSearching(true);
    const results = await searchUsersByUsername(query.trim());
    
    // Filter out current user from results
    const filteredResults = results.filter(result => result.uid !== user?.uid);
    
    // Check status for each user (contact, request sent, request received, etc.)
    const states: { [key: string]: 'send' | 'sent' | 'contact' | 'incoming' } = {};
    if (user) {
      for (const result of filteredResults) {
        // Check if already a contact
        const alreadyContact = await isContact(user.uid, result.uid);
        if (alreadyContact) {
          states[result.uid] = 'contact';
          continue;
        }

        // Check for existing requests
        const existingRequest = await checkExistingRequest(user.uid, result.uid);
        if (existingRequest) {
          if (existingRequest.fromUid === user.uid) {
            states[result.uid] = 'sent'; // We sent them a request
          } else {
            states[result.uid] = 'incoming'; // They sent us a request
          }
        } else {
          states[result.uid] = 'send'; // Can send a new request
        }
      }
    }
    
    setButtonStates(states);
    setSearchResults(filteredResults);
    setSearching(false);
  };

  const handleSendRequest = async (targetUser: UserProfile) => {
    if (!user) return;

    // Get current user profile to send with request
    const currentUserProfile = await getUserProfile(user.uid);
    if (!currentUserProfile) {
      Alert.alert('Error', 'Could not load your profile information');
      return;
    }

    setSendingRequest(targetUser.uid);
    const success = await sendContactRequest(currentUserProfile, targetUser);
    setSendingRequest(null);
    
    if (success) {
      Alert.alert('Success', `Contact request sent to ${targetUser.username}!`);
      // Update button state
      setButtonStates(prev => ({
        ...prev,
        [targetUser.uid]: 'sent'
      }));
    } else {
      Alert.alert('Error', 'Failed to send contact request');
    }
  };

  const renderUser = ({ item }: { item: UserProfile }) => (
    <UserSearchItem
      user={item}
      onSendRequest={handleSendRequest}
      isSendingRequest={sendingRequest === item.uid}
      buttonState={buttonStates[item.uid] || 'send'}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search users by username..."
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            handleSearch(text);
          }}
          autoCapitalize="none"
        />
      </View>

      {searching && (
        <View style={styles.centerContainer}>
          <Text>Searching...</Text>
        </View>
      )}

      {!searching && searchQuery && searchResults.length === 0 && (
        <View style={styles.centerContainer}>
          <Text style={styles.noResultsText}>No users found</Text>
        </View>
      )}

      <FlatList
        data={searchResults}
        renderItem={renderUser}
        keyExtractor={(item) => item.uid}
        style={styles.resultsList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noResultsText: {
    color: '#666',
    fontSize: 16,
  },
  resultsList: {
    flex: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  userInfo: {
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
  userDetails: {
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
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  sendButton: {
    backgroundColor: '#007AFF',
  },
  sentButton: {
    backgroundColor: '#f0f0f0',
  },
  contactButton: {
    backgroundColor: '#34C759',
  },
  incomingButton: {
    backgroundColor: '#ff9500',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sentButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  incomingButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});