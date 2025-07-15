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
import { searchUsersByUsername, UserProfile } from '@/services/userService';
import { addContact, isContact } from '@/services/contactService';

interface UserSearchItemProps {
  user: UserProfile;
  onAddContact: (user: UserProfile) => void;
  isAddingContact: boolean;
  isAlreadyContact: boolean;
}

const UserSearchItem: React.FC<UserSearchItemProps> = ({ 
  user, 
  onAddContact, 
  isAddingContact, 
  isAlreadyContact 
}) => {
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
        style={[
          styles.addButton,
          isAlreadyContact && styles.addButtonDisabled
        ]}
        onPress={() => onAddContact(user)}
        disabled={isAddingContact || isAlreadyContact}
      >
        <Text style={[
          styles.addButtonText,
          isAlreadyContact && styles.addButtonTextDisabled
        ]}>
          {isAddingContact ? 'Adding...' : isAlreadyContact ? 'Added' : 'Add'}
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
  const [addingContact, setAddingContact] = useState<string | null>(null);
  const [contactStatuses, setContactStatuses] = useState<{ [key: string]: boolean }>({});

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const results = await searchUsersByUsername(query.trim());
    
    // Filter out current user from results
    const filteredResults = results.filter(result => result.uid !== user?.uid);
    
    // Check contact status for each user
    const statuses: { [key: string]: boolean } = {};
    if (user) {
      for (const result of filteredResults) {
        statuses[result.uid] = await isContact(user.uid, result.uid);
      }
    }
    
    setContactStatuses(statuses);
    setSearchResults(filteredResults);
    setSearching(false);
  };

  const handleAddContact = async (targetUser: UserProfile) => {
    if (!user) return;

    setAddingContact(targetUser.uid);
    const success = await addContact(user.uid, targetUser);
    
    if (success) {
      Alert.alert('Success', `${targetUser.username} added to contacts`);
      setContactStatuses(prev => ({
        ...prev,
        [targetUser.uid]: true
      }));
    } else {
      Alert.alert('Error', 'Failed to add contact');
    }
    
    setAddingContact(null);
  };

  const renderUser = ({ item }: { item: UserProfile }) => (
    <UserSearchItem
      user={item}
      onAddContact={handleAddContact}
      isAddingContact={addingContact === item.uid}
      isAlreadyContact={contactStatuses[item.uid] || false}
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
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addButtonTextDisabled: {
    color: '#999',
  },
});