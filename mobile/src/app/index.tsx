import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Video } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

const GENZ_NAMES = [
  'VibeCheck', 'MainCharacter', 'Bruh', 'Ghosted', 'SlayQueen',
  'CEOofYapping', 'NoCap', 'BratSummer', 'Sigma', 'RizzlyBear',
  'Skibidi', 'W_Rizz', 'Based', 'TouchGrass', 'Delulu',
];

const generateName = () =>
  `${GENZ_NAMES[Math.floor(Math.random() * GENZ_NAMES.length)]}_${Math.floor(Math.random() * 999)}`;

export default function PreCallLobby() {
  const [name] = useState(generateName());
  const [room] = useState('lobby');

  const handleJoinCall = () => {
    router.push({ pathname: '/room/[id]', params: { id: room.trim().toLowerCase() } } as any);
  };

  return (
    <View style={styles.container}>
      {/* Background glow effects (simulated with large blurred circles) */}
      <View style={[styles.glowCircle, styles.glowCyan]} />
      <View style={[styles.glowCircle, styles.glowViolet]} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Frosted Glass Icon Container */}
          <BlurView intensity={40} tint="light" style={styles.iconContainer}>
            <View style={styles.iconBorder}>
              <Video color="#67E8F9" size={32} />
            </View>
          </BlurView>

          <Text style={styles.title}>V-Call</Text>
          <Text style={styles.subtitle}>minimal, fast, peer-to-peer.</Text>

          <TouchableOpacity style={styles.button} onPress={handleJoinCall} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Join Room</Text>
          </TouchableOpacity>

          <Text style={styles.roomText}>
            Room <Text style={styles.roomName}>{room}</Text>
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070707',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.15,
  },
  glowCyan: {
    backgroundColor: '#06b6d4', // Cyan
    top: height * 0.2,
    left: -50,
  },
  glowViolet: {
    backgroundColor: '#8b5cf6', // Violet
    bottom: height * 0.2,
    right: -50,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#71717a', // zinc-500
  },
  button: {
    marginTop: 40,
    height: 56,
    minWidth: 240,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8, // For Android
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  roomText: {
    marginTop: 20,
    fontSize: 13,
    color: '#52525b', // zinc-600
  },
  roomName: {
    color: '#a1a1aa', // zinc-400
    fontFamily: 'monospace',
  },
});
