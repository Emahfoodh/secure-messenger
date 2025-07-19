// types/messageTypes.ts

export interface ImageData {
  uri: string;
  downloadURL: string;
  width: number;
  height: number;
  size: number;
}

export interface VideoData {
  uri: string;
  downloadURL: string;
  thumbnailURL?: string;
  duration: number; // in seconds
  width: number;
  height: number;
  size: number; // in bytes
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName?: string;
  senderProfilePicture?: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'file' | 'deleted';
  timestamp: string;
  status: 'sending' | 'sent' | 'read';
  readBy?: string[]; // Array of user IDs who have read this message
  editedAt?: string;
  // 🔐 Encryption support
  isEncrypted?: boolean; // Whether this message is encrypted
  encryptedContent?: string; // The encrypted version of the content (stored in DB)
  // Media-specific data
  imageData?: ImageData;
  videoData?: VideoData;
  replyTo?: {
    messageId: string;
    content: string;
    senderUsername: string;
  };
}

export interface SendMessageData {
  content: string;
  type: 'text' | 'image' | 'video' | 'file';
  // 🔐 Encryption flag
  shouldEncrypt?: boolean; // Whether to encrypt this message
  // Media-specific data for sending
  imageData?: ImageData;
  videoData?: VideoData;
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
    type: 'text' | 'image' | 'video' | 'file';
    isEncrypted?: boolean; // 🔐 NEW: Whether last message is encrypted
  };
  lastActivity: string;
  createdAt: string;
  createdBy: string;
  unreadCount: { [userId: string]: number };
  isActive: boolean;
  // 🔐 Encryption settings
  isSecretChat?: boolean; // Whether this is a secret chat with encryption
  encryptionEnabled?: boolean; // Whether encryption is enabled for this chat
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
    isEncrypted?: boolean; 
  };
}