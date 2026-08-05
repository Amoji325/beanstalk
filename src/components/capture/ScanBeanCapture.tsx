import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TurboModuleRegistry,
  View,
} from 'react-native';
import { launchImageLibraryAsync } from 'expo-image-picker';
import type { ScanDocumentResponse } from 'react-native-document-scanner-plugin';
import type { BiomeConfig } from '@src/constants';
import type { Bean } from '@src/types';

// The scanner is a native TurboModule. We load it lazily (require, not a static
// import) so a dev build that predates it degrades gracefully to a "needs
// rebuild" prompt instead of red-screening the whole app at startup. Enum values
// are inlined ('imageFilePath' / 'cancel') to avoid importing the module here.
type ScannerModule = {
  scanDocument(opts: {
    croppedImageQuality?: number;
    responseType?: string;
    maxNumDocuments?: number;
  }): Promise<ScanDocumentResponse>;
};

function loadScanner(): ScannerModule | null {
  // get() returns null (never throws) when the native module is absent, so we
  // detect a stale build *before* require() triggers the package's getEnforcing
  // call — which would otherwise red-screen in dev even inside a try/catch.
  if (TurboModuleRegistry.get('DocumentScanner') == null) return null;
  try {
    return require('react-native-document-scanner-plugin').default as ScannerModule;
  } catch {
    return null; // native module absent in this binary
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PLANT_H = 52;
const SHADOW_OFF = 4;
const TITLE_MAX = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanBeanCaptureProps {
  stalkId: string;
  biome: BiomeConfig;
  onCapture?: (bean: Omit<Bean, 'id'>) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The native scanner returns bare file paths on some platforms — normalise to a URI. */
function toUri(path: string): string {
  if (/^[a-z]+:\/\//i.test(path)) return path; // already file:// / content:// / http(s)://
  return `file://${path}`;
}

function makeScanBean(stalkId: string, pages: string[], title: string): Omit<Bean, 'id'> {
  return {
    stalkId,
    type: 'scan',
    anatomyRole: 'root',
    createdAt: Date.now(),
    // Page 1 doubles as the timeline thumbnail + the cloud-synced artifact.
    scanThumbnailUri: pages[0],
    scanPageUris: pages,
    title: title.trim() || undefined,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanBeanCapture({ stalkId, biome, onCapture }: ScanBeanCaptureProps) {
  const { palette } = biome;
  const [pages, setPages] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  // ── Capture ─────────────────────────────────────────────────────────────────
  // Opens the OS document scanner (VisionKit on iOS, ML Kit on Android): auto
  // edge-detection, perspective crop, glare cleanup, multi-page. Returns cleaned
  // page images which we append to the staged set.

  const openScanner = async () => {
    if (isScanning) return;

    const scanner = loadScanner();
    if (!scanner) {
      Alert.alert(
        'Scanner needs a rebuild',
        'The document scanner isn’t part of this app build yet. Rebuild the dev client (eas build --profile development) to enable page scanning.',
      );
      return;
    }

    setIsScanning(true);
    try {
      const { scannedImages, status } = await scanner.scanDocument({
        croppedImageQuality: 90,
        responseType: 'imageFilePath',
      });
      if (status === 'cancel') return; // user backed out
      if (scannedImages?.length) {
        setPages((prev) => [...prev, ...scannedImages.map(toUri)]);
      }
    } catch (e) {
      console.warn('[Beanstalk] document scan failed:', e);
      Alert.alert('Scan failed', 'The page couldn’t be scanned. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const addFromLibrary = async () => {
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setPages((prev) => [...prev, result.assets[0].uri]);
    } catch {
      Alert.alert('Photo library error', 'That image couldn’t be added. Please try another.');
    }
  };

  // ── Plant / discard ───────────────────────────────────────────────────────

  const reset = () => {
    setPages([]);
    setTitle('');
  };

  const removePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePlant = () => {
    if (pages.length === 0) return;
    onCapture?.(makeScanBean(stalkId, pages, title));
    reset();
  };

  // ── Render: empty state (no pages staged yet) ───────────────────────────────

  if (pages.length === 0) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: palette.backgroundEnd }]}>
        <Text style={styles.emptyGlyph}>📄</Text>
        <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
          Scan a journal page
        </Text>
        <Text style={[styles.emptyBody, { color: palette.textSecondary }]}>
          Line up a handwritten page — the edges snap automatically and it’s
          saved as a clean, readable image.
        </Text>

        <TouchableOpacity
          style={[styles.scanButton, { backgroundColor: palette.accentColor }, isScanning && styles.busy]}
          onPress={openScanner}
          disabled={isScanning}
          activeOpacity={0.85}
        >
          <Text style={styles.scanButtonLabel}>{isScanning ? 'Opening…' : 'Scan a Page'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={addFromLibrary} activeOpacity={0.7} hitSlop={8}>
          <Text style={[styles.libraryLink, { color: palette.textSecondary }]}>
            Choose from library
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: staged pages preview ────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: palette.backgroundEnd }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.previewScroll}
        contentContainerStyle={styles.previewContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageCount, { color: `${palette.textSecondary}99` }]}>
          {pages.length === 1 ? '1 PAGE' : `${pages.length} PAGES`}
        </Text>

        {pages.map((uri, i) => (
          <View key={`${uri}-${i}`} style={styles.pageWrap}>
            <Image source={{ uri }} style={styles.pageImage} resizeMode="contain" />
            <TouchableOpacity
              style={styles.removeBadge}
              onPress={() => removePage(i)}
              hitSlop={8}
              activeOpacity={0.8}
            >
              <Text style={styles.removeBadgeLabel}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.addPageBtn, { borderColor: palette.accentColor }, isScanning && styles.busy]}
          onPress={openScanner}
          disabled={isScanning}
          activeOpacity={0.8}
        >
          <Text style={[styles.addPageLabel, { color: palette.accentColor }]}>
            {isScanning ? 'Opening…' : '＋ Add another page'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fixed action bar */}
      <View style={[styles.actionBar, { backgroundColor: palette.backgroundEnd }]}>
        <TextInput
          style={[
            styles.titleInput,
            {
              color: palette.textPrimary,
              borderColor: `${palette.textSecondary}44`,
              backgroundColor: `${palette.textPrimary}08`,
            },
          ]}
          placeholder="Name this entry..."
          placeholderTextColor={`${palette.textSecondary}55`}
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX}
          returnKeyType="done"
          autoFocus={false}
          autoCapitalize="words"
        />

        <View style={styles.plantOuter}>
          <View style={[styles.plantShadow, { backgroundColor: `${palette.textPrimary}28` }]} />
          <TouchableOpacity
            style={[
              styles.plantBtn,
              { backgroundColor: palette.accentColor, borderColor: `${palette.textPrimary}BB` },
            ]}
            onPress={handlePlant}
            activeOpacity={0.85}
          >
            <Text style={styles.plantLabel}>Plant Bean</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: `${palette.textSecondary}66` }]}
          onPress={reset}
          activeOpacity={0.7}
        >
          <Text style={[styles.secondaryLabel, { color: palette.textSecondary }]}>
            Start over
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 36,
  },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyGlyph: {
    fontSize: 56,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  scanButton: {
    marginTop: 8,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 28,
  },
  scanButtonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  busy: {
    opacity: 0.55,
  },
  libraryLink: {
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

  // ── Preview layout ──────────────────────────────────────────────────────────
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 16,
  },
  pageCount: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  pageWrap: {
    height: SCREEN_HEIGHT * 0.42,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  pageImage: {
    flex: 1,
    width: '100%',
  },
  removeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBadgeLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  addPageBtn: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addPageLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Action bar ──────────────────────────────────────────────────────────────
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
