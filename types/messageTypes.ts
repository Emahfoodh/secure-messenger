// types/messageTypes.ts

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName?: string;
  senderProfilePicture?: string;
  content: string;
  type: 'text' | 'image' | 'file'; // For future expansion
  timestamp: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  editedAt?: string;
  replyTo?: string; // For future reply feature
}

export interface Chat {
  id: string;
  participants: string[]; // Array of user UIDs
  participantDetails: ChatParticipant[];
  lastMessage?: {
    content: string;
    senderId: string;
    senderUsername: string;
    timestamp: string;
    type: 'text' | 'image' | 'file';
  };
  lastActivity: string | any; // Can be Firestore Timestamp or string
  createdAt: string | any; // Can be Firestore Timestamp or string
  createdBy: string;
  unreadCount: { [userUid: string]: number };
  isActive: boolean;
}

export interface ChatParticipant {
  uid: string;
  username: string;
  displayName?: string;
  profilePicture?: string;
  joinedAt: string;
  lastSeen?: string;
}

export interface ChatListItem {
  chat: Chat;
  otherParticipant: ChatParticipant; // For 1-on-1 chats
  unreadCount: number;
  lastMessage?: {
    content: string;
    senderId: string;
    senderUsername: string;
    timestamp: string;
    isOwnMessage: boolean;
  };
}

export interface SendMessageData {
  content: string;
  type: 'text' | 'image' | 'file';
  replyTo?: string;
}