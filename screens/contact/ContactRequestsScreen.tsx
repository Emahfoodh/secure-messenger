import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import {
  ContactRequest,
  getIncomingRequests,
  getOutgoingRequests,
  acceptContactRequest,
  declineContactRequest,
  cancelContactRequest,
} from '@/services/contactService';

type RequestTabType = 'incoming' | 'outgoing';

interface IncomingRequestItemProps {
  request: ContactRequest;
  onAccept: (request: ContactRequest) => void;
  onDecline: (requestId: string) => void;
  loading: boolean;
}

interface OutgoingRequestItemProps {
  request: ContactRequest;
  onCancel: (requestId: string) => void;
  loading: boolean;
}

const IncomingRequestItem: React.FC<IncomingRequestItemProps> = ({ 
  request, 
  onAccept, 
  onDecline, 
  loading 
}) => {
  return (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        {request.fromProfilePicture ? (
          <Image source={{ uri: request.fromProfilePicture }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {request.fromUsername.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.requestDetails}>
          <Text style={styles.username}>{request.fromUsername}</Text>
          {request.fromDisplayName && (
            <Text style={styles.displayName}>{request.fromDisplayName}</Text>
          )}
          <Text style={styles.requestTime}>
            {new Date(request.sentAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
      
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.declineButton]}
          onPress={() => onDecline(request.id)}
          disabled={loading}
        >
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={() => onAccept(request)}
          disabled={loading}
        >
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const OutgoingRequestItem: React.FC<OutgoingRequestItemProps> = ({ 
  request, 
  onCancel, 
  loading 
}) => {
  return (
    <View style={styles.requestItem}>
      <View style={styles.requestInfo}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {request.toUsername.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.requestDetails}>
          <Text style={styles.username}>{request.toUsername}</Text>
          <Text style={styles.statusText}>Request sent</Text>
          <Text style={styles.requestTime}>
            {new Date(request.sentAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
      
      <TouchableOpacity
        style={[styles.actionButton, styles.cancelButton]}
        onPress={() => onCancel(request.id)}
        disabled={loading}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function ContactRequestsScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<RequestTabType>('incoming');
  const [incomingRequests, setIncomingRequests] = useState<ContactRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const [incoming, outgoing] = await Promise.all([
        getIncomingRequests(user.uid),
        getOutgoingRequests(user.uid)
      ]);
      
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const handleAcceptRequest = async (request: ContactRequest) => {
    setActionLoading(true);
    const success = await acceptContactRequest(request);
    
    if (success) {
      Alert.alert('Success', `${request.fromUsername} has been added to your contacts!`);
      await loadRequests(); // Refresh the list
    } else {
      Alert.alert('Error', 'Failed to accept contact request');
    }
    setActionLoading(false);
  };

  const handleDeclineRequest = async (requestId: string) => {
    setActionLoading(true);
    const success = await declineContactRequest(requestId);
    
    if (success) {
      Alert.alert('Success', 'Contact request declined');
      await loadRequests(); // Refresh the list
    } else {
      Alert.alert('Error', 'Failed to decline contact request');
    }
    setActionLoading(false);
  };

  const handleCancelRequest = async (requestId: string) => {
    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this contact request?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes', 
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            const success = await cancelContactRequest(requestId);
            
            if (success) {
              Alert.alert('Success', 'Contact request cancelled');
              await loadRequests(); // Refresh the list
            } else {
              Alert.alert('Error', 'Failed to cancel contact request');
            }
            setActionLoading(false);
          }
        }
      ]
    );
  };

  const renderIncomingRequest = ({ item }: { item: ContactRequest }) => (
    <IncomingRequestItem
      request={item}
      onAccept={handleAcceptRequest}
      onDecline={handleDeclineRequest}
      loading={actionLoading}
    />
  );

  const renderOutgoingRequest = ({ item }: { item: ContactRequest }) => (
    <OutgoingRequestItem
      request={item}
      onCancel={handleCancelRequest}
      loading={actionLoading}
    />
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <Text>Loading requests...</Text>
        </View>
      );
    }

    const requests = activeTab === 'incoming' ? incomingRequests : outgoingRequests;
    
    if (requests.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.noRequestsText}>
            {activeTab === 'incoming' ? 'No incoming requests' : 'No outgoing requests'}
          </Text>
          <Text style={styles.noRequestsSubtext}>
            {activeTab === 'incoming' 
              ? 'New contact requests will appear here'
              : 'Contact requests you send will appear here'
            }
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={requests}
        renderItem={activeTab === 'incoming' ? renderIncomingRequest : renderOutgoingRequest}
        keyExtractor={(item) => item.id}
        style={styles.requestsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'incoming' && styles.activeTab]}
          onPress={() => setActiveTab('incoming')}
        >
          <Text style={[styles.tabText, activeTab === 'incoming' && styles.activeTabText]}>
            Incoming ({incomingRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'outgoing' && styles.activeTab]}
          onPress={() => setActiveTab('outgoing')}
        >
          <Text style={[styles.tabText, activeTab === 'outgoing' && styles.activeTabText]}>
            Outgoing ({outgoingRequests.length})
          </Text>
        </TouchableOpacity>
      </View>

      {renderContent()}
    </View>
  );
}

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
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noRequestsText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  noRequestsSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  requestsList: {
    flex: 1,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  requestDetails: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  displayName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  statusText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 2,
  },
  requestTime: {
    fontSize: 12,
    color: '#999',
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
  declineButton: {
    backgroundColor: '#ff3b30',
  },
  cancelButton: {
    backgroundColor: '#ff9500',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  declineButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});