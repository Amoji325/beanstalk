import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { BIOMES, BIOME_ORDER } from '@src/constants';
import type { BiomeTheme } from '@src/types';

// ─── Create Branch Form ───────────────────────────────────────────────────────
// A themed modal for naming a new branch and picking its biome. Reusable from
// anywhere (the Tree home screen uses it for "+ New branch").

interface CreateBranchFormProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, theme: BiomeTheme) => void;
}

export default function CreateBranchForm({ visible, onClose, onCreate }: CreateBranchFormProps) {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<BiomeTheme>('standard');

  const reset = () => {
    setName('');
    setTheme('standard');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCreate = () => {
    onCreate(name.trim() || 'New Branch', theme);
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} activeOpacity={1} />

          <Animated.View
            entering={ZoomIn.springify().damping(24).stiffness(340).mass(0.5)}
            exiting={ZoomOut.duration(130)}
            style={styles.card}
          >
            <View style={styles.header}>
              <Text style={styles.title}>New Branch</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Morning Journal…"
                placeholderTextColor="rgba(200,230,201,0.35)"
                value={name}
                onChangeText={setName}
                maxLength={40}
                autoFocus={false}
                returnKeyType="done"
                selectionColor="#56c464"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Theme</Text>
              <View style={styles.themeList}>
                {BIOME_ORDER.map((t, i) => {
                  const cfg = BIOMES[t];
                  const selected = t === theme;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.themeRow,
                        i === 0 && styles.themeRowFirst,
                        i === BIOME_ORDER.length - 1 && styles.themeRowLast,
                        selected && {
                          backgroundColor: `${cfg.palette.accentColor}22`,
                          borderColor: cfg.palette.accentColor,
                        },
                      ]}
                      onPress={() => setTheme(t)}
                      activeOpacity={0.72}
                    >
                      <View style={[styles.themeSwatch, { backgroundColor: cfg.palette.vineColor }]} />
                      <Text style={[styles.themeName, selected && styles.themeNameSelected]}>
                        {cfg.displayName}
                      </Text>
                      {selected && (
                        <Text style={[styles.checkmark, { color: cfg.palette.accentColor }]}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.plantButton, { backgroundColor: BIOMES[theme].palette.accentColor }]}
              onPress={handleCreate}
              activeOpacity={0.85}
            >
              <Text style={styles.plantLabel}>Grow Branch</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)' },
  kav: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#111a12',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(86,196,100,0.2)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: { color: '#d4edda', fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
  closeIcon: { color: 'rgba(200,230,201,0.4)', fontSize: 17, fontWeight: '300' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(86,196,100,0.15)', marginHorizontal: 20 },
  section: { paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  sectionLabel: {
    color: 'rgba(200,230,201,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(86,196,100,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: '#d4edda',
    fontWeight: '300',
  },
  themeList: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  themeRowFirst: { borderTopLeftRadius: 11, borderTopRightRadius: 11 },
  themeRowLast: { borderBottomLeftRadius: 11, borderBottomRightRadius: 11 },
  themeSwatch: { width: 14, height: 14, borderRadius: 4 },
  themeName: { flex: 1, fontSize: 14, color: 'rgba(200,230,201,0.6)', fontWeight: '400' },
  themeNameSelected: { color: '#d4edda', fontWeight: '600' },
  checkmark: { fontSize: 14, fontWeight: '700' },
  plantButton: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  plantLabel: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
});
