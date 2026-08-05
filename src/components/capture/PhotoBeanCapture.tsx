import React, { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import type { BiomeConfig } from '@src/constants';
import type { Bean } from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const GALLERY_SIZE = 50;
const SHADOW_OFF = 4;
const PLANT_H = 52;
const TITLE_MAX = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoBeanCaptureProps {
  stalkId: string;
  biome: BiomeConfig;
  onCapture?: (bean: Omit<Bean, 'id'>) => void;
}

type StagedPhoto = { uri: string };

// ─── Gallery button icon (drawn with Views) ───────────────────────────────────

function GalleryIcon() {
  return (
    <View style={galleryIconStyles.frame}>
      <View style={galleryIconStyles.sky} />
      <View style={galleryIconStyles.sun} />
      <View style={galleryIconStyles.mountainLeft} />
      <View style={galleryIconStyles.mountainRight} />
    </View>
  );
}

const galleryIconStyles = StyleSheet.create({
  frame: {
    width: 22,
    height: 18,
    borderWidth: 2,
    borderColor: '#1a1208',
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#c8dff0',
  },
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#c8dff0',
  },
  sun: {
    position: 'absolute',
    top: 2,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#f5c842',
  },
  mountainLeft: {
    position: 'absolute',
    bottom: 0,
    left: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#5a8a5a',
  },
  mountainRight: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#3d6b3d',
  },
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function PhotoBeanCapture({ stalkId, biome, onCapture }: PhotoBeanCaptureProps) {
  const { palette } = biome;
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [staged, setStaged] = useState<StagedPhoto | null>(null);
  const [title, setTitle] = useState('');
  const cameraRef = useRef<CameraView>(null);

  // ── Capture / pick ───────────────────────────────────────────────────────────

  const handleShutter = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92 });
      if (photo?.uri) setStaged({ uri: photo.uri });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleGalleryPick = async () => {
    const result = await launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.92,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setStaged({ uri: result.assets[0].uri });
  };

  const toggleFacing = () => setFacing(f => f === 'back' ? 'front' : 'back');

  // Double-tap anywhere on the preview flips the camera.
  const doubleTapFlip = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      runOnJS(toggleFacing)();
    });

  // ── Plant / discard ──────────────────────────────────────────────────────────

  const handlePlant = () => {
    if (!staged) return;
    onCapture?.({
      stalkId,
      type: 'photo',
      anatomyRole: 'flower',
      createdAt: Date.now(),
      imageUri: staged.uri,
      title: title.trim() || undefined,
    });
    setStaged(null);
    setTitle('');
  };

  // ── Render: staged preview ───────────────────────────────────────────────────

  if (staged) {
    return (
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: '#000' }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Full image preview */}
        <Image
          source={{ uri: staged.uri }}
          style={styles.previewImage}
          resizeMode="contain"
        />

        {/* Action bar */}
        <View style={[styles.actionBar, { backgroundColor: palette.backgroundEnd }]}>
          {/* Title input */}
          <TextInput
            style={[
              styles.titleInput,
              {
                color: palette.textPrimary,
                borderColor: `${palette.textSecondary}44`,
                backgroundColor: `${palette.textPrimary}08`,
              },
            ]}
            placeholder="Name your bean..."
            placeholderTextColor={`${palette.textSecondary}55`}
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
            returnKeyType="done"
            autoFocus={false}
            autoCapitalize="words"
          />

          <View style={styles.plantOuter}>
            <View
              style={[
                styles.plantShadow,
                { backgroundColor: `${palette.textPrimary}28` },
              ]}
            />
            <TouchableOpacity
              style={[
                styles.plantBtn,
                {
                  backgroundColor: palette.accentColor,
                  borderColor: `${palette.textPrimary}BB`,
                },
              ]}
              onPress={handlePlant}
              activeOpacity={0.85}
            >
              <Text style={styles.plantLabel}>Plant Bean</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: `${palette.textSecondary}66` }]}
            onPress={() => { setStaged(null); setTitle(''); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryLabel, { color: palette.textSecondary }]}>
              Retake
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Render: permission gate ──────────────────────────────────────────────────

  if (!permission?.granted) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: palette.backgroundEnd }]}>
        <Text style={[styles.permissionText, { color: palette.textSecondary }]}>
          Camera access is needed to capture photo memories.
        </Text>
        {permission?.canAskAgain !== false && (
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: palette.accentColor }]}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonLabel}>Grant Access</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Render: camera UI ────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      {/* Transparent double-tap layer over the preview (below the controls) */}
      <GestureDetector gesture={doubleTapFlip}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {/* Flip button — labelled pill so it's unmistakable */}
      <TouchableOpacity style={styles.flipButton} onPress={toggleFacing} activeOpacity={0.8}>
        <Text style={styles.flipIcon}>🔄</Text>
        <Text style={styles.flipLabel}>Flip</Text>
      </TouchableOpacity>

      {/* Bottom bar: gallery + shutter */}
      <View style={styles.bottomBar}>
        {/* Gallery button — cartoon outline + flat shadow */}
        <View style={styles.galleryWrap}>
          <View style={styles.galleryShadow} />
          <TouchableOpacity style={styles.galleryBtn} onPress={handleGalleryPick} activeOpacity={0.8}>
            <GalleryIcon />
          </TouchableOpacity>
        </View>

        {/* Shutter */}
        <TouchableOpacity
          style={[styles.shutter, isCapturing && styles.shutterBusy]}
          onPress={handleShutter}
          disabled={isCapturing}
          activeOpacity={0.8}
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 40,
  },
  permissionText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permissionButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Image preview ──────────────────────────────────────────────────────────
  previewImage: {
    flex: 1,
    width: '100%',
  },

  // ── Camera controls ───────────────────────────────────────────────────────
  flipButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  flipIcon: {
    fontSize: 16,
    lineHeight: 20,
  },
  flipLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },

  // ── Gallery button ────────────────────────────────────────────────────────
  galleryWrap: {
    width: GALLERY_SIZE + SHADOW_OFF,
    height: GALLERY_SIZE + SHADOW_OFF,
  },
  galleryShadow: {
    position: 'absolute',
    top: SHADOW_OFF,
    left: SHADOW_OFF,
    width: GALLERY_SIZE,
    height: GALLERY_SIZE,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  galleryBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GALLERY_SIZE,
    height: GALLERY_SIZE,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.75)',
    backgroundColor: 'rgba(255,255,255,0.90)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Shutter ───────────────────────────────────────────────────────────────
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },

  // ── Action bar (preview footer) ───────────────────────────────────────────
  actionBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
    alignItems: 'center',
  },
  titleInput: {
    width: '100%',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 14,
  },
  plantOuter: {
    width: '100%',
    height: PLANT_H + SHADOW_OFF,
  },
  plantShadow: {
    position: 'absolute',
    top: SHADOW_OFF,
    left: SHADOW_OFF,
    right: 0,
    bottom: 0,
    borderRadius: PLANT_H / 2,
  },
  plantBtn: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: SHADOW_OFF,
    height: PLANT_H,
    borderRadius: PLANT_H / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});
