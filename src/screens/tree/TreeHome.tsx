import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useUser } from '@clerk/expo';
import { useStalk } from '@src/context/StalkContext';
import { getBiome } from '@src/constants';
import { fetchBeanCountsByStalk } from '@src/database';
import CreateBranchForm from '@src/components/CreateBranchForm';
import { AccountAvatarGlyph, accountInitial, avatarKind } from '@src/components/AccountMenu';
import { computeTreeLayout } from './branchLayout';
import { makeStars } from './starfield';
import { resolveTreeName, sanitizeTreeName, TREE_NAME_MAX } from './treeIdentity';
import type { BiomeTheme } from '@src/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Palette ──────────────────────────────────────────────────────────────────

const NIGHT = '#0a1224';          // deep indigo sky
const HORIZON = 'rgba(28,74,86,0.55)'; // teal mist band near the base
const WOOD = '#5a3d24';
const WOOD_LIGHT = '#734e2f';
const WOOD_DARK = '#402917';
const CROWN_GREENS = ['rgba(30,90,42,0.9)', 'rgba(46,125,50,0.85)', 'rgba(67,160,71,0.8)'];
const TEXT = '#e8f0e6';
const TEXT_DIM = '#8fa8a0';
const ACCENT = '#7fc98a';

const TRUNK_W = 30;
const NODE_W = 158;
const NODE_H = 60;

// Stable starfield (module-level so it never re-randomises on re-render).
const STARS = makeStars({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, count: 90, seed: 42 });

// Crown foliage: overlapping soft circles relative to the trunk top.
const CROWN = [
  { dx: 0, dy: -18, r: 96, ci: 0 },
  { dx: -74, dy: 22, r: 72, ci: 1 },
  { dx: 74, dy: 22, r: 72, ci: 1 },
  { dx: -40, dy: -46, r: 66, ci: 2 },
  { dx: 44, dy: -44, r: 66, ci: 2 },
  { dx: 0, dy: 40, r: 80, ci: 1 },
];

// Root flare at the base: angled roots spreading down and out.
const ROOTS = [
  { rot: -58, len: 76 },
  { rot: -30, len: 92 },
  { rot: 0, len: 70 },
  { rot: 30, len: 92 },
  { rot: 58, len: 76 },
];

// ─── Small leaf mark ──────────────────────────────────────────────────────────

function Leaf({ color, size }: { color: string; size: number }) {
  const d = Math.round(size * 0.72);
  return (
    <View
      style={{
        width: d,
        height: d,
        backgroundColor: color,
        borderTopLeftRadius: d,
        borderBottomRightRadius: d,
        borderTopRightRadius: Math.round(d * 0.12),
        borderBottomLeftRadius: Math.round(d * 0.12),
      }}
    />
  );
}

// ─── Tree Home ────────────────────────────────────────────────────────────────

interface TreeHomeProps {
  onOpenBranch: (stalkId: string) => void;
  onOpenAccount: () => void;
}

export default function TreeHome({ onOpenBranch, onOpenAccount }: TreeHomeProps) {
  const { stalks, createStalk, deleteStalk } = useStalk();
  const { user } = useUser();

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const treeName = resolveTreeName(user);

  useEffect(() => {
    let cancelled = false;
    fetchBeanCountsByStalk()
      .then((c) => { if (!cancelled) setCounts(c); })
      .catch((e) => console.warn('[Tree] count fetch failed:', e));
    return () => { cancelled = true; };
  }, [stalks.length]);

  const layout = useMemo(
    () => computeTreeLayout({ width: SCREEN_WIDTH, count: stalks.length }),
    [stalks.length],
  );

  const contentHeight = Math.max(layout.height, SCREEN_HEIGHT);
  const offsetY = Math.round((contentHeight - layout.height) / 2);
  const crownX = layout.trunkX;
  const crownY = layout.trunkTop + offsetY;
  const baseY = layout.trunkBottom + offsetY;

  const handleCreate = useCallback(
    async (name: string, theme: BiomeTheme) => {
      setCreating(false);
      await createStalk(name, theme);
    },
    [createStalk],
  );

  const handleLongPress = useCallback(
    (id: string, name: string) => {
      if (id === 'default-garden') {
        Alert.alert('Can’t remove this branch', 'Your first branch is the root of the tree and can’t be deleted.');
        return;
      }
      Alert.alert('Delete branch?', `"${name}" and all its memories will be permanently removed.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteStalk(id).catch(console.warn) },
      ]);
    },
    [deleteStalk],
  );

  const saveTreeName = async () => {
    const clean = sanitizeTreeName(nameDraft);
    setRenaming(false);
    if (!clean || !user) return;
    try {
      await user.updateMetadata({ unsafeMetadata: { treeName: clean } });
      await user.reload();
    } catch (e) {
      console.warn('[Tree] rename failed:', e);
    }
  };

  const initial = accountInitial(user);
  const kind = avatarKind(user);

  return (
    <View style={styles.root}>
      {/* ── Fixed night sky backdrop ─────────────────────────────────────────── */}
      <View style={styles.horizon} pointerEvents="none" />
      {STARS.map((s, i) => (
        <View
          key={`star-${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.r * 2,
            height: s.r * 2,
            borderRadius: s.r,
            backgroundColor: '#fff',
            opacity: s.opacity,
          }}
        />
      ))}
      {/* Moon */}
      <View style={styles.moonGlow} pointerEvents="none" />
      <View style={styles.moon} pointerEvents="none" />

      {/* ── Scrolling tree ───────────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={{ height: contentHeight }} showsVerticalScrollIndicator={false}>
        {/* Crown foliage */}
        {CROWN.map((c, i) => (
          <View
            key={`crown-${i}`}
            style={{
              position: 'absolute',
              left: crownX + c.dx - c.r,
              top: crownY + c.dy - c.r,
              width: c.r * 2,
              height: c.r * 2,
              borderRadius: c.r,
              backgroundColor: CROWN_GREENS[c.ci],
            }}
          />
        ))}

        {/* Trunk (with bark shading) */}
        <View
          style={[
            styles.trunk,
            { left: layout.trunkX - TRUNK_W / 2, top: layout.trunkTop + offsetY, height: Math.max(0, layout.trunkBottom - layout.trunkTop) },
          ]}
        />
        <View
          style={[
            styles.trunkHighlight,
            { left: layout.trunkX - TRUNK_W / 2 + 4, top: layout.trunkTop + offsetY, height: Math.max(0, layout.trunkBottom - layout.trunkTop) },
          ]}
        />

        {/* Root flare */}
        {ROOTS.map((r, i) => (
          <View
            key={`root-${i}`}
            style={{
              position: 'absolute',
              left: layout.trunkX - 6,
              top: baseY - 8,
              width: 12,
              height: r.len,
              borderRadius: 6,
              backgroundColor: WOOD_DARK,
              transform: [{ translateY: r.len / 2 }, { rotate: `${r.rot}deg` }, { translateY: -r.len / 2 }],
            }}
          />
        ))}
        <View style={[styles.trunkBase, { left: layout.trunkX - 26, top: baseY - 18 }]} />

        {/* Branch arms + a couple of leaves each */}
        {layout.branches.map((b) => (
          <React.Fragment key={`arm-${b.index}`}>
            <View
              style={{
                position: 'absolute',
                left: b.midX - b.length / 2,
                top: b.midY - 5 + offsetY,
                width: b.length,
                height: 11,
                borderRadius: 6,
                backgroundColor: WOOD,
                transform: [{ rotate: `${b.rotationDeg}deg` }],
              }}
            />
            <View style={{ position: 'absolute', left: (b.attachX + b.tipX) / 2 - 6, top: (b.attachY + b.tipY) / 2 - 16 + offsetY }}>
              <Leaf color={CROWN_GREENS[1]} size={14} />
            </View>
          </React.Fragment>
        ))}

        {/* Branch nodes (tappable) */}
        {layout.branches.map((b, i) => {
          const stalk = stalks[i];
          if (!stalk) return null;
          const biome = getBiome(stalk.themeType);
          const accent = biome.palette.accentColor;
          const count = counts[stalk.id] ?? 0;
          const centerX = Math.min(Math.max(b.tipX, NODE_W / 2 + 10), SCREEN_WIDTH - NODE_W / 2 - 10);

          return (
            <Animated.View
              key={stalk.id}
              entering={FadeInDown.delay(i * 45).springify().damping(18)}
              style={{ position: 'absolute', left: centerX - NODE_W / 2, top: b.tipY - NODE_H / 2 + offsetY }}
            >
              <TouchableOpacity
                style={[styles.node, { borderColor: accent, backgroundColor: biome.nodeSurface }]}
                onPress={() => onOpenBranch(stalk.id)}
                onLongPress={() => handleLongPress(stalk.id, stalk.name)}
                delayLongPress={350}
                activeOpacity={0.85}
              >
                <View style={[styles.nodeLeafWrap, { backgroundColor: `${accent}22` }]}>
                  <Leaf color={accent} size={22} />
                </View>
                <View style={styles.nodeText}>
                  <Text style={[styles.nodeName, { color: biome.palette.textPrimary }]} numberOfLines={1}>
                    {stalk.name}
                  </Text>
                  <Text style={[styles.nodeCount, { color: biome.palette.textSecondary }]} numberOfLines={1}>
                    {count === 1 ? '1 memory' : `${count} memories`}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* ── Header overlay ─────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.accountBtn, { borderColor: ACCENT }]}
        onPress={onOpenAccount}
        activeOpacity={0.82}
      >
        <AccountAvatarGlyph kind={kind} initial={initial} color={ACCENT} bg="#0e1a2c" size={22} />
      </TouchableOpacity>

      <View style={styles.titleWrap} pointerEvents="box-none">
        <TouchableOpacity onPress={() => { setNameDraft(treeName); setRenaming(true); }} activeOpacity={0.7} hitSlop={10}>
          <Text style={styles.title} numberOfLines={1}>{treeName}</Text>
          <Text style={styles.titleHint}>your tree · tap to rename</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.newBtn, { borderColor: ACCENT }]} onPress={() => setCreating(true)} activeOpacity={0.82}>
        <Text style={[styles.newBtnPlus, { color: ACCENT }]}>+</Text>
      </TouchableOpacity>

      {stalks.length <= 1 && (
        <Animated.View entering={FadeIn.delay(300)} style={styles.emptyHint} pointerEvents="none">
          <Text style={styles.emptyHintText}>Tap a branch to open it, or grow a new one with +</Text>
        </Animated.View>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <CreateBranchForm visible={creating} onClose={() => setCreating(false)} onCreate={handleCreate} />

      <Modal visible={renaming} transparent animationType="none" onRequestClose={() => setRenaming(false)} statusBarTranslucent>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.renameBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenaming(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.renameKav}>
            <Animated.View entering={ZoomIn.springify().damping(24).stiffness(340).mass(0.5)} exiting={ZoomOut.duration(130)} style={styles.renameCard}>
              <Text style={styles.renameTitle}>Name your tree</Text>
              <TextInput
                style={styles.renameInput}
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="My Tree"
                placeholderTextColor="rgba(200,230,201,0.35)"
                maxLength={TREE_NAME_MAX}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveTreeName}
                selectionColor={ACCENT}
              />
              <TouchableOpacity style={[styles.renameSave, { backgroundColor: ACCENT }]} onPress={saveTreeName} activeOpacity={0.85}>
                <Text style={styles.renameSaveLabel}>Save</Text>
              </TouchableOpacity>
            </Animated.View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NIGHT },

  horizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.34,
    backgroundColor: HORIZON,
  },
  moonGlow: {
    position: 'absolute',
    top: 74,
    right: 34,
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(220,235,255,0.12)',
  },
  moon: {
    position: 'absolute',
    top: 92,
    right: 52,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#e8eefc',
  },

  trunk: { position: 'absolute', width: TRUNK_W, borderRadius: TRUNK_W / 2, backgroundColor: WOOD },
  trunkHighlight: { position: 'absolute', width: 7, borderRadius: 4, backgroundColor: WOOD_LIGHT, opacity: 0.7 },
  trunkBase: { position: 'absolute', width: 52, height: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: WOOD },

  node: {
    width: NODE_W,
    height: NODE_H,
    borderRadius: 16,
    borderWidth: 2.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 0,
    elevation: 6,
  },
  nodeLeafWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nodeText: { flex: 1 },
  nodeName: { fontSize: 15, fontWeight: '700' },
  nodeCount: { fontSize: 12, fontWeight: '500', marginTop: 1 },

  accountBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0e1a2c',
  },
  titleWrap: { position: 'absolute', top: 52, left: 62, right: 62, alignItems: 'center' },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center', color: TEXT },
  titleHint: { fontSize: 11, textAlign: 'center', marginTop: 2, color: TEXT_DIM },
  newBtn: {
    position: 'absolute',
    top: 52,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0e1a2c',
  },
  newBtnPlus: { fontSize: 24, fontWeight: '400', lineHeight: 28 },

  emptyHint: { position: 'absolute', bottom: 44, left: 40, right: 40, alignItems: 'center' },
  emptyHintText: { fontSize: 14, textAlign: 'center', lineHeight: 20, color: TEXT_DIM },

  renameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)' },
  renameKav: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  renameCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111a12',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(127,201,138,0.3)',
    padding: 20,
    gap: 14,
  },
  renameTitle: { color: '#d4edda', fontSize: 17, fontWeight: '700' },
  renameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(127,201,138,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: '#d4edda',
  },
  renameSave: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  renameSaveLabel: { color: '#08240f', fontSize: 15, fontWeight: '800' },
});
