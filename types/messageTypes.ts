// types/messageTypes.ts

export interface ImageData {
  uri: string;
  downloadURL: string;
  width: number;
  height: number;
  size: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName?: string;
  senderProfilePicture?: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'deleted';
  timestamp: string;
  status: 'sending' | 'sent' | 'read';
  readBy?: string[]; // Array of user IDs who have read this message
  editedAt?: string;
  // Image-specific data
  imageData?: ImageData;
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
}

export interface SendMessageData {
  content: string;
  type: 'text' | 'image' | 'file';
  // Image-specific data for sending
  imageData?: ImageData;
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
}

export interface Chat {
  id: string;
  participants: string[]; // Array of user IDs
  participantDetails: ChatParticipant[];
  lastMessage?: {
    content: string;
    senderId: string;
    senderUsername: string;
    timestamp: string;
    type: 'text' | 'image' | 'file';
  };
  lastActivity: string;
  createdAt: string;
  createdBy: string;
  unreadCount: { [userId: string]: number };
  isActive: boolean;
}

export interface ChatParticipant {
  uid: string;
  username: string;
  displayName?: string;
  profilePicture?: string;
  joinedAt: string;
}

export interface ChatListItem {
  chat: Chat;
  otherParticipant: {
    uid: string;
    username: string;
    displayName?: string;
    profilePicture?: string;
  };
  unreadCount: number;
  lastMessage?: {
    content: string;
    senderId: string;
    senderUsername: string;
    timestamp: string;
    isOwnMessage: boolean;
  };
}