import React, { useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import type { BiomeConfig } from '@src/constants';
import type { Bean } from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCAN_FRAME_WIDTH = SCREEN_WIDTH * 0.82;
const SCAN_FRAME_HEIGHT = SCREEN_HEIGHT * 0.34;
const CORNER_SIZE = 22;
const CORNER_THICKNESS = 3;
const SHADOW_OFF = 4;
const PLANT_H = 52;
const TITLE_MAX = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanBeanCaptureProps {
  stalkId: string;
  biome: BiomeConfig;
  onCapture?: (bean: Omit<Bean, 'id'>) => void;
}

type StagedScan = { uri: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScanBean(stalkId: string, uri: string): Omit<Bean, 'id'> {
  return {
    stalkId,
    type: 'scan',
    anatomyRole: 'root',
    createdAt: Date.now(),
    scanThumbnailUri: uri,
    scannedText: '',
    transcriptionStatus: 'pending',
  };
}

// ─── Scan Frame Corner ────────────────────────────────────────────────────────

interface CornerProps {
  position: 'tl' | 'tr' | 'bl' | 'br';
  color: string;
}

function FrameCorner({ position, color }: CornerProps) {
  const isTop = position === 'tl' || position === 'tr';
  const isLeft = position === 'tl' || position === 'bl';
  return (
    <View
      style={[
        styles.corner,
        isTop ? styles.cornerTop : styles.cornerBottom,
        isLeft ? styles.cornerLeft : styles.cornerRight,
        {
          borderColor: color,
          borderTopWidth: isTop ? CORNER_THICKNESS : 0,
          borderBottomWidth: !isTop ? CORNER_THICKNESS : 0,
          borderLeftWidth: isLeft ? CORNER_THICKNESS : 0,
          borderRightWidth: !isLeft ? CORNER_THICKNESS : 0,
        },
      ]}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanBeanCapture({ stalkId, biome, onCapture }: ScanBeanCaptureProps) {
  const { palette } = biome;
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [staged, setStaged] = useState<StagedScan | null>(null);
  const [title, setTitle] = useState('');
  const cameraRef = useRef<CameraView>(null);

  // ── Capture / pick ────────────────────────────────────────────────────────

  const handleScan = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) setStaged({ uri: photo.uri });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleGalleryPick = async () => {
    const result = await launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setStaged({ uri: result.assets[0].uri });
  };

  // ── Plant / discard ───────────────────────────────────────────────────────

  const handlePlant = () => {
    if (!staged) return;
    onCapture?.({ ...makeScanBean(stalkId, staged.uri), title: title.trim() || undefined });
    setStaged(null);
    setTitle('');
  };

  // ── Render: staged preview ────────────────────────────────────────────────

  if (staged) {
    return (
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: palette.backgroundEnd }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Scrollable content: thumbnail + text extract area */}
        <ScrollView
          style={styles.previewScroll}
          contentContainerStyle={styles.previewContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Scanned page thumbnail */}
          <View style={styles.thumbnailWrap}>
            <Image
              source={{ uri: staged.uri }}
              style={styles.thumbnail}
              resizeMode="contain"
            />
          </View>

          {/* Divider */}
          <View
            style={[
              styles.divider,
              { backgroundColor: `${palette.textSecondary}22` },
            ]}
          />

          {/* Extracted text area */}
          <View style={styles.textArea}>
            <Text
              style={[styles.textAreaLabel, { color: `${palette.textSecondary}99` }]}
            >
              EXTRACTED TEXT
            </Text>
            <Text style={[styles.textAreaBody, { color: `${palette.textSecondary}77` }]}>
              Text will be extracted from this page after planting.
            </Text>
          </View>
        </ScrollView>

        {/* Fixed action bar */}
        <View
          style={[
            styles.actionBar,
            { backgroundColor: palette.backgroundEnd },
          ]}
        >
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
              Rescan
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Render: permission gate ────────────────────────────────────────────────

  if (!permission?.granted) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: palette.backgroundEnd }]}>
        <Text style={[styles.permissionText, { color: palette.textSecondary }]}>
          Camera access is needed to scan journal pages.
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

  // ── Render: camera scan UI ────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Overlay with scan frame cutout */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.maskTop} />
        <View style={styles.maskMiddleRow}>
          <View style={styles.maskSide} />
          <View style={styles.scanFrame}>
            <FrameCorner position="tl" color={palette.accentColor} />
            <FrameCorner position="tr" color={palette.accentColor} />
            <FrameCorner position="bl" color={palette.accentColor} />
            <FrameCorner position="br" color={palette.accentColor} />
          </View>
          <View style={styles.maskSide} />
        </View>
        <View style={styles.maskBottom}>
          <Text style={styles.scanHint}>Align handwritten text within the frame</Text>
        </View>
      </View>

      {/* Bottom bar: Library + Scan Page */}
      <View style={styles.bottomBar}>
        {/* Library button — cartoon outline + flat shadow */}
        <View style={styles.libOuter}>
          <View style={styles.libShadow} />
          <TouchableOpacity style={styles.libBtn} onPress={handleGalleryPick} activeOpacity={0.85}>
            <Text style={styles.libIcon}>⬆</Text>
            <Text style={styles.libLabel}>Library</Text>
          </TouchableOpacity>
        </View>

        {/* Scan Page button */}
        <TouchableOpacity
          style={[
            styles.scanButton,
            { backgroundColor: palette.accentColor },
            isCapturing && styles.scanButtonBusy,
          ]}
          onPress={handleScan}
          disabled={isCapturing}
          activeOpacity={0.85}
        >
          <Text style={styles.scanButtonLabel}>
            {isCapturing ? 'Scanning…' : 'Scan Page'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const MASK_ALPHA = 'rgba(0,0,0,0.62)';

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

  // ── Preview layout ────────────────────────────────────────────────────────
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    paddingTop: 24,
    paddingBottom: 8,
  },
  thumbnailWrap: {
    height: SCREEN_HEIGHT * 0.42,
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  thumbnail: {
    flex: 1,
    width: '100%',
  },
  divider: {
    height: 1,
    marginHorizontal: 24,
    marginVertical: 20,
  },
  textArea: {
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 10,
  },
  textAreaLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  textAreaBody: {
    fontSize: 15,
    lineHeight: 24,
    fontStyle: 'italic',
  },

  // ── Overlay ───────────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'column',
  },
  maskTop: {
    flex: 1,
    backgroundColor: MASK_ALPHA,
  },
  maskMiddleRow: {
    flexDirection: 'row',
    height: SCAN_FRAME_HEIGHT,
  },
  maskSide: {
    flex: 1,
    backgroundColor: MASK_ALPHA,
  },
  scanFrame: {
    width: SCAN_FRAME_WIDTH,
    height: SCAN_FRAME_HEIGHT,
    position: 'relative',
  },
  maskBottom: {
    flex: 1,
    backgroundColor: MASK_ALPHA,
    alignItems: 'center',
    paddingTop: 16,
  },
  scanHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── Corner ────────────────────────────────────────────────────────────────
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTop: { top: 0 },
  cornerBottom: { bottom: 0 },
  cornerLeft: { left: 0 },
  cornerRight: { right: 0 },

  // ── Bottom bar (camera mode) ──────────────────────────────────────────────
  bottomBar: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  // ── Library button (cartoon pill) ────────────────────────────────────────
  libOuter: {
    // Sized by libBtn (normal flow child). Shadow overflows via position:absolute.
  },
  libShadow: {
    position: 'absolute',
    top: SHADOW_OFF,
    left: SHADOW_OFF,
    right: -SHADOW_OFF,
    bottom: -SHADOW_OFF,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  libBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  libIcon: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 20,
  },
  libLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Scan Page button ──────────────────────────────────────────────────────
  scanButton: {
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 28,
  },
  scanButtonBusy: {
    opacity: 0.55,
  },
  scanButtonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Action bar (preview footer) ───────────────────────────────────────────
  actionBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
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
