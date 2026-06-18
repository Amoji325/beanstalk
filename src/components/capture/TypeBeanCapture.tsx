import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { BiomeConfig } from '@src/constants';
import type { Bean } from '@src/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TITLE_MAX = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TypeBeanCaptureProps {
  stalkId: string;
  biome: BiomeConfig;
  onCapture?: (bean: Omit<Bean, 'id'>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TypeBeanCapture({ stalkId, biome, onCapture }: TypeBeanCaptureProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const bodyRef = useRef<TextInput>(null);

  const canPlant = text.trim().length > 0;
  const { palette } = biome;

  const handlePlant = () => {
    if (!canPlant) return;
    const bean: Omit<Bean, 'id'> = {
      stalkId,
      type: 'type',
      anatomyRole: 'leaf',
      createdAt: Date.now(),
      textContent: text.trim(),
      title: title.trim() || undefined,
    };
    onCapture?.(bean);
    setTitle('');
    setText('');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: palette.backgroundEnd }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* ── Title field ─────────────────────────────────────────────────── */}
        <TextInput
          style={[
            styles.titleInput,
            {
              color: palette.textPrimary,
              borderBottomColor: `${palette.textSecondary}44`,
            },
          ]}
          placeholder="Name your bean..."
          placeholderTextColor={`${palette.textSecondary}55`}
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX}
          returnKeyType="next"
          autoCapitalize="words"
          onSubmitEditing={() => bodyRef.current?.focus()}
          blurOnSubmit={false}
        />

        {/* ── Body content ────────────────────────────────────────────────── */}
        <TextInput
          ref={bodyRef}
          style={[styles.input, { color: palette.textPrimary }]}
          multiline
          placeholder="What's growing in your mind today?"
          placeholderTextColor={`${palette.textSecondary}55`}
          value={text}
          onChangeText={setText}
          autoCorrect
          autoCapitalize="sentences"
          textAlignVertical="top"
          scrollEnabled
          selectionColor={palette.accentColor}
        />

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.plantButton,
              { backgroundColor: palette.accentColor },
              !canPlant && styles.plantButtonDisabled,
            ]}
            onPress={handlePlant}
            disabled={!canPlant}
            activeOpacity={0.8}
          >
            <Text style={styles.plantButtonLabel}>Plant Bean</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingTop: 100,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },

  // ── Title ─────────────────────────────────────────────────────────────────
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    marginBottom: 16,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 27,
    fontWeight: '300',
    letterSpacing: 0.1,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 12,
  },
  plantButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  plantButtonDisabled: {
    opacity: 0.3,
  },
  plantButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
