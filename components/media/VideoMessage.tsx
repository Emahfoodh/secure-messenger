// components/media/VideoMessage.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MessageStatus, VideoData } from '@/types/messageTypes';
import { VideoService } from '@/services/videoService';
import { useVideoPlayer, VideoView } from 'expo-video';

interface VideoMessageProps {
  videoData: VideoData;
  isOwnMessage: boolean;
  timestamp: string;
  status?: MessageStatus;
  maxWidth?: number;
}

const { width: screenWidth } = Dimensions.get('window');

export default function VideoMessage({
  videoData,
  isOwnMessage,
  timestamp,
  status,
  maxWidth = 280,
}: VideoMessageProps) {
  const [fullScreenVisible, setFullScreenVisible] = useState(false);

  // Calculate display dimensions
  const displaySize = VideoService.calculateChatVideoSize(
    videoData.width,
    videoData.height,
    maxWidth,
    200
  );

  // Create video players
  const chatPlayer = useVideoPlayer(videoData.downloadURL, player => {
    player.loop = false;
    player.muted = true; // Start muted in chat
  });

  const fullscreenPlayer = useVideoPlayer(videoData.downloadURL, player => {
    player.loop = false;
    player.muted = false; // Unmuted in fullscreen
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusIcon = () => {
    if (!isOwnMessage) return '';
    
    switch (status) {
      case 'sending':
        return '⏳';
      case 'sent':
        return '✓';
      case 'read':
        return '✓✓';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'read':
        return '#34C759';
      case 'sent':
        return 'rgba(255,255,255,0.7)';
      case 'sending':
        return 'rgba(255,255,255,0.5)';
      default:
        return 'rgba(255,255,255,0.7)';
    }
  };

  const handleVideoPress = () => {
    setFullScreenVisible(true);
  };

  const handlePlayPause = () => {
    if (chatPlayer.playing) {
      chatPlayer.pause();
    } else {
      chatPlayer.play();
    }
  };

  const ChatVideoContent = () => (
    <View style={styles.videoContainer}>
      <View style={styles.videoWrapper}>
        <VideoView
          style={[styles.video, displaySize]}
          player={chatPlayer}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
        
        {/* Play button overlay */}
        <TouchableOpacity
          style={styles.playButtonOverlay}
          onPress={handlePlayPause}
          activeOpacity={0.8}
        >
          <View style={styles.playButton}>
            <Text style={styles.playButtonIcon}>
              {chatPlayer.playing ? '⏸️' : '▶️'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Video info overlay */}
        <View style={styles.videoInfoOverlay}>
          <Text style={styles.videoDuration}>
            {VideoService.formatDuration(videoData.duration)}
          </Text>
        </View>
      </View>
      
      {/* Overlay with timestamp and status */}
      <View style={styles.overlay}>
        <Text style={[
          styles.timestamp,
          isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp
        ]}>
          {formatTime(timestamp)}
        </Text>
        
        {isOwnMessage && (
          <Text style={[styles.statusIcon, { color: getStatusColor() }]}>
            {getStatusIcon()}
          </Text>
        )}
      </View>
    </View>
  );

  const FullScreenModal = () => (
    <Modal
      visible={fullScreenVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setFullScreenVisible(false)}
    >
      <View style={styles.fullScreenContainer}>
        <TouchableOpacity
          style={styles.closeFullScreen}
          onPress={() => setFullScreenVisible(false)}
        >
          <Text style={styles.closeFullScreenText}>✕</Text>
        </TouchableOpacity>
        
        <View style={styles.fullScreenVideoContainer}>
          <VideoView
            style={styles.fullScreenVideo}
            player={fullscreenPlayer}
            allowsFullscreen={true}
            allowsPictureInPicture={true}
          />
        </View>
        
        <View style={styles.fullScreenInfo}>
          <Text style={styles.fullScreenTimestamp}>
            {new Date(timestamp).toLocaleString()}
          </Text>
          <Text style={styles.fullScreenDuration}>
            Duration: {VideoService.formatDuration(videoData.duration)}
          </Text>
          <Text style={styles.fullScreenSize}>
            {videoData.width} × {videoData.height} • {VideoService.formatFileSize(videoData.size)}
          </Text>
        </View>
      </View>
    </Modal>
  );

  return (
    <>
      <TouchableOpacity
        style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
        ]}
        onPress={handleVideoPress}
        activeOpacity={0.8}
      >
        <ChatVideoContent />
      </TouchableOpacity>
      
      <FullScreenModal />
    </>
  );
}

const styles = StyleSheet.create({
  messageBubble: {
    borderRadius: 16,
    overflow: 'hidden',
    maxWidth: '75%',
    marginVertical: 1,
  },
  ownMessageBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  videoContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
  },
  videoWrapper: {
    position: 'relative',
  },
  video: {
    borderRadius: 12,
    backgroundColor: '#000',
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonIcon: {
    fontSize: 20,
    color: '#fff',
  },
  videoInfoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDuration: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#fff',
  },
  ownTimestamp: {
    color: '#fff',
  },
  otherTimestamp: {
    color: '#fff',
  },
  statusIcon: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  // Full screen modal styles
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFullScreen: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFullScreenText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  fullScreenVideoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  fullScreenVideo: {
    width: screenWidth - 40,
    height: '70%',
  },
  fullScreenInfo: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  fullScreenTimestamp: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  fullScreenDuration: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginBottom: 2,
  },
  fullScreenSize: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
  },
});