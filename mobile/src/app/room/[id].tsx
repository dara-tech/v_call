import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { RTCView } from 'react-native-webrtc';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react-native';
import { useWebRTC } from '../../hooks/useWebRTC';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');

export default function RoomScreen() {
  const { id } = useLocalSearchParams();
  const roomId = id as string;
  const userName = 'MobileUser_' + Math.floor(Math.random() * 1000);
  const userId = 'user_' + Math.random().toString(36).substr(2, 9);

  const { peers, localStream, isMuted, isCameraOff, toggleMute, toggleCamera } = useWebRTC(roomId, userName, userId);

  const handleLeave = () => {
    router.back();
  };

  const activePeers = Object.values(peers);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Room: {roomId}</Text>
        </View>

        {/* Video Grid */}
        <View style={styles.grid}>
          {/* Local Video */}
          <View style={[styles.videoContainer, activePeers.length > 0 && styles.smallLocalVideo]}>
            {localStream && !isCameraOff ? (
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.video}
                objectFit="cover"
              />
            ) : (
              <View style={styles.videoPlaceholder}>
                <Text style={styles.placeholderText}>{userName.charAt(0)}</Text>
              </View>
            )}
            <View style={styles.nameBadge}>
              <Text style={styles.nameText}>You {isMuted && '(Muted)'}</Text>
            </View>
          </View>

          {/* Remote Videos */}
          {activePeers.map((peer) => (
            <View key={peer.socketId} style={styles.videoContainer}>
              {peer.stream ? (
                <RTCView
                  streamURL={peer.stream.toURL()}
                  style={styles.video}
                  objectFit="cover"
                />
              ) : (
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.placeholderText}>{peer.userName.charAt(0)}</Text>
                </View>
              )}
              <View style={styles.nameBadge}>
                <Text style={styles.nameText}>{peer.userName}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Bottom Toolbar */}
        <View style={styles.toolbarWrapper}>
          <BlurView intensity={60} tint="dark" style={styles.toolbar}>
            
            <TouchableOpacity 
              style={[styles.toolButton, isMuted && styles.toolButtonDanger]} 
              onPress={toggleMute}
            >
              {isMuted ? <MicOff color="#fff" size={24} /> : <Mic color="#fff" size={24} />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.toolButton, isCameraOff && styles.toolButtonDanger]} 
              onPress={toggleCamera}
            >
              {isCameraOff ? <VideoOff color="#fff" size={24} /> : <Video color="#fff" size={24} />}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.toolButton, styles.leaveButton]} onPress={handleLeave}>
              <PhoneOff color="#fff" size={24} />
            </TouchableOpacity>

          </BlurView>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    padding: 16,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#a1a1aa',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
    alignContent: 'center',
    justifyContent: 'center',
  },
  videoContainer: {
    width: width - 32,
    height: (width - 32) * 1.3,
    backgroundColor: '#18181b',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  smallLocalVideo: {
    width: (width - 40) / 2,
    height: ((width - 40) / 2) * 1.3,
  },
  video: {
    flex: 1,
  },
  videoPlaceholder: {
    flex: 1,
    backgroundColor: '#18181b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#3f3f46',
    fontSize: 48,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  nameBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  nameText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  toolbarWrapper: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 32,
    gap: 16,
    overflow: 'hidden',
  },
  toolButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonDanger: {
    backgroundColor: 'rgba(239,68,68,0.2)', // red-500 with opacity
  },
  leaveButton: {
    backgroundColor: '#ef4444', // red-500
  },
});
