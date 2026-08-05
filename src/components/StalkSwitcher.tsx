import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useStalk } from '@src/context/StalkContext';
import { BIOMES, BIOME_ORDER, getBiome } from '@src/constants';
import type { BiomeTheme } from '@src/types';

// ─── Create Stalk Form (rendered inside a Modal) ──────────────────────────────

interface CreateFormProps {
  onSubmit: (name: string, theme: BiomeTheme) => void;
  onCancel: () => void;
}

function CreateStalkForm({ onSubmit, onCancel }: CreateFormProps) {
  const [name, setName]       = useState('');
  const [theme, setTheme]     = useState<BiomeTheme>('standard');

  const handlePlant = () => {
    onSubmit(name.trim() || 'New Stalk', theme);
  };

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(140)}
      style={formStyles.backdrop}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={formStyles.kav}
      >
        {/* Tap outside to cancel */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          activeOpacity={1}
        />

        <Animated.View
          entering={ZoomIn.springify().damping(24).stiffness(340).mass(0.5)}
          exiting={ZoomOut.duration(130)}
          style={formStyles.card}
        >
          {/* Header */}
          <View style={formStyles.header}>
            <Text style={formStyles.title}>New Stalk</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={12}>
              <Text style={formStyles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={formStyles.divider} />

          {/* Name input */}
          <View style={formStyles.section}>
            <Text style={formStyles.sectionLabel}>Name</Text>
            <TextInput
              style={formStyles.input}
              placeholder="e.g. Morning Pages…"
              placeholderTextColor="rgba(200,230,201,0.3)"
              value={name}
              onChangeText={setName}
              maxLength={40}
              autoFocus={false}
              returnKeyType="done"
              selectionColor="#56c464"
            />
          </View>

          {/* Theme picker */}
          <View style={formStyles.section}>
            <Text style={formStyles.sectionLabel}>Theme</Text>
            <View style={formStyles.themeList}>
              {BIOME_ORDER.map((t, i) => {
                const cfg = BIOMES[t];
                const selected = t === theme;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      formStyles.themeRow,
                      // Round the outer row corners so a selected row's border
                      // isn't clipped by the list's rounded, overflow-hidden edge.
                      i === 0 && formStyles.themeRowFirst,
                      i === BIOME_ORDER.length - 1 && formStyles.themeRowLast,
                      selected && {
                        backgroundColor: `${cfg.palette.accentColor}22`,
                        borderColor: cfg.palette.accentColor,
                      },
                    ]}
                    onPress={() => setTheme(t)}
                    activeOpacity={0.72}
                  >
                    {/* Vine colour swatch */}
                    <View
                      style={[
                        formStyles.themeSwatch,
                        { backgroundColor: cfg.palette.vineColor },
                      ]}
                    />
                    <Text style={[formStyles.themeName, selected && formStyles.themeNameSelected]}>
                      {cfg.displayName}
                    </Text>
                    {selected && (
                      <Text style={[formStyles.checkmark, { color: cfg.palette.accentColor }]}>
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Plant button */}
          <TouchableOpacity
            style={[
              formStyles.plantButton,
              { backgroundColor: BIOMES[theme].palette.accentColor },
            ]}
            onPress={handlePlant}
            activeOpacity={0.85}
          >
            <Text style={formStyles.plantLabel}>Plant Stalk</Text>
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ─── Stalk Switcher ───────────────────────────────────────────────────────────

interface StalkSwitcherProps {
  /** Fired when the stalk dropdown opens — lets the parent close the search. */
  onOpen?: () => void;
}

export default function StalkSwitcher({ onOpen }: StalkSwitcherProps) {
  const {
    stalks,
    activeStalk,
    activeStalkId,
    biome,
    setActiveStalkId,
    createStalk,
    deleteStalk,
  } = useStalk();

  const [open, setOpen]             = useState(false);
  const [showForm, setShowForm]     = useState(false);

  const { palette, nodeSurface } = biome;

  const handleSelect = (id: string) => {
    setActiveStalkId(id);
    setOpen(false);
  };

  const handleNewStalkPress = () => {
    setOpen(false);
    setShowForm(true);
  };

  const handleFormSubmit = async (name: string, theme: BiomeTheme) => {
    setShowForm(false);
    await createStalk(name, theme);
  };

  const handleDeleteStalk = (stalk: { id: string; name: string }) => {
    Alert.alert(
      'Delete stalk?',
      `"${stalk.name}" and all its beans will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setOpen(false);
            deleteStalk(stalk.id).catch(console.warn);
          },
        },
      ]
    );
  };

  return (
    <>
      <View style={styles.container} pointerEvents="box-none">
        {/* Active stalk pill */}
        <TouchableOpacity
          style={[
            styles.pill,
            { backgroundColor: nodeSurface, borderColor: palette.accentColor },
          ]}
          onPress={() =>
            setOpen((o) => {
              const next = !o;
              if (next) onOpen?.(); // opening the stalk menu closes search
              return next;
            })
          }
          activeOpacity={0.85}
        >
          <View style={[styles.dot, { backgroundColor: palette.accentColor }]} />
          <Text style={[styles.pillLabel, { color: palette.textPrimary }]} numberOfLines={1}>
            {activeStalk?.name ?? 'Garden'}
          </Text>
          <Text style={[styles.caret, { color: palette.textSecondary }]}>
            {open ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>

        {/* Dropdown */}
        {open && (
          <View
            style={[
              styles.dropdown,
              { backgroundColor: nodeSurface, borderColor: palette.accentColor },
            ]}
          >
            <ScrollView style={styles.dropdownScroll} bounces={false}>
              {stalks.map((stalk) => {
                const isActive = stalk.id === activeStalkId;
                const stalkBiome = getBiome(stalk.themeType);
                const isDeletable = stalk.id !== 'default-garden';
                return (
                  <View
                    key={stalk.id}
                    style={[
                      styles.row,
                      isActive && { backgroundColor: `${palette.accentColor}22` },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.rowTouchable}
                      onPress={() => handleSelect(stalk.id)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[styles.swatch, { backgroundColor: stalkBiome.palette.vineColor }]}
                      />
                      <Text
                        style={[
                          styles.rowLabel,
                          { color: palette.textPrimary },
                          isActive && { fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {stalk.name}
                      </Text>
                      <Text style={[styles.rowTheme, { color: palette.textSecondary }]}>
                        {stalkBiome.displayName}
                      </Text>
                    </TouchableOpacity>

                    {isDeletable && (
                      <TouchableOpacity
                        style={styles.trashBtn}
                        onPress={() => handleDeleteStalk(stalk)}
                        hitSlop={8}
                        activeOpacity={0.6}
                      >
                        <Text style={[styles.trashIcon, { color: palette.textSecondary }]}>🗑</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {/* New stalk row */}
              <TouchableOpacity
                style={[styles.rowTouchable, styles.newRow, { borderTopColor: `${palette.textSecondary}33` }]}
                onPress={handleNewStalkPress}
                activeOpacity={0.7}
              >
                <Text style={[styles.newPlus, { color: palette.accentColor }]}>＋</Text>
                <Text style={[styles.rowLabel, { color: palette.accentColor }]}>New stalk</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>

      {/* Creation form — rendered in a native Modal so it floats above all layers */}
      <Modal
        visible={showForm}
        transparent
        animationType="none"
        onRequestClose={() => setShowForm(false)}
        statusBarTranslucent
      >
        <CreateStalkForm
          onSubmit={handleFormSubmit}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </>
  );
}

// ─── Switcher Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },

  // ── Pill ────────────────────────────────────────────────────────────────────
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    maxWidth: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillLabel: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  caret: {
    fontSize: 10,
    marginLeft: 2,
  },

  // ── Dropdown ────────────────────────────────────────────────────────────────
  dropdown: {
    marginTop: 8,
    width: 260,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  dropdownScroll: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  rowTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  trashBtn: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trashIcon: {
    fontSize: 14,
    opacity: 0.5,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  rowLabel: {
    fontSize: 14,
    flex: 1,
  },
  rowTheme: {
    fontSize: 11,
  },
  newRow: {
    borderTopWidth: 1,
  },
  newPlus: {
    fontSize: 16,
    width: 12,
    textAlign: 'center',
  },
});

// ─── Form Styles ──────────────────────────────────────────────────────────────

const formStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  kav: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
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
  title: {
    color: '#d4edda',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  closeIcon: {
    color: 'rgba(200,230,201,0.4)',
    fontSize: 17,
    fontWeight: '300',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(86,196,100,0.15)',
    marginHorizontal: 20,
  },

  // ── Section ─────────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 10,
  },
  sectionLabel: {
    color: 'rgba(200,230,201,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  // ── Name Input ───────────────────────────────────────────────────────────────
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

  // ── Theme List ───────────────────────────────────────────────────────────────
  themeList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 0,
  },
  themeRowFirst: {
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
  },
  themeRowLast: {
    borderBottomLeftRadius: 11,
    borderBottomRightRadius: 11,
  },
  themeSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  themeName: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(200,230,201,0.6)',
    fontWeight: '400',
  },
  themeNameSelected: {
    color: '#d4edda',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Plant Button ─────────────────────────────────────────────────────────────
  plantButton: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  plantLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
