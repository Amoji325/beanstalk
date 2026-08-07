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
import { resolveTreeName, sanitizeTreeName, TREE_NAME_MAX } from './treeIdentity';
import type { BiomeTheme } from '@src/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// The tree canvas uses a single calm base theme; each branch is tinted by its
// own biome so the crown reads as one tree with many coloured limbs.
const TREE = getBiome('standard');
const WOOD = '#6b4a2e';
const WOOD_DARK = '#553a24';

const NODE_W = 156;
const NODE_H = 58;
const TRUNK_W = 16;

// ─── Small leaf mark ──────────────────────────────────────────────────────────

function Leaf({ color, size }: { color: string; size: number }) {
  const d = Math.round(size * 0.7);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
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
    </View>
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

  // Refresh per-branch memory counts whenever the screen mounts (i.e. every time
  // we return to the tree from a branch).
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

  // Centre the tree vertically when it's shorter than the screen; taller trees
  // scroll. offsetY shifts every element down so a small tree isn't stuck at top.
  const contentHeight = Math.max(layout.height, SCREEN_HEIGHT);
  const offsetY = Math.round((contentHeight - layout.height) / 2);

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
      <ScrollView
        contentContainerStyle={{ height: contentHeight }}
        showsVerticalScrollIndicator={false}
      >
        {/* Crown — soft foliage silhouette behind the trunk top */}
        <View
          style={[
            styles.crown,
            {
              left: layout.trunkX - 150,
              top: layout.trunkTop - 150 + offsetY,
            },
          ]}
        />

        {/* Trunk */}
        <View
          style={[
            styles.trunk,
            {
              left: layout.trunkX - TRUNK_W / 2,
              top: layout.trunkTop + offsetY,
              height: Math.max(0, layout.trunkBottom - layout.trunkTop),
            },
          ]}
        />
        {/* Roots flare at the base */}
        <View style={[styles.rootFlare, { left: layout.trunkX - 40, top: layout.trunkBottom - 10 + offsetY }]} />

        {/* Branch arms (decorative) */}
        {layout.branches.map((b) => (
          <View
            key={`arm-${b.index}`}
            style={{
              position: 'absolute',
              left: b.midX - b.length / 2,
              top: b.midY - 5 + offsetY,
              width: b.length,
              height: 10,
              borderRadius: 5,
              backgroundColor: WOOD,
              transform: [{ rotate: `${b.rotationDeg}deg` }],
            }}
          />
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
      {/* Account avatar (top-left) */}
      <TouchableOpacity
        style={[styles.accountBtn, { backgroundColor: TREE.nodeSurface, borderColor: TREE.palette.accentColor }]}
        onPress={onOpenAccount}
        activeOpacity={0.82}
      >
        <AccountAvatarGlyph kind={kind} initial={initial} color={TREE.palette.accentColor} bg={TREE.nodeSurface} size={22} />
      </TouchableOpacity>

      {/* Tree name (center, tap to rename) */}
      <View style={styles.titleWrap} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => { setNameDraft(treeName); setRenaming(true); }}
          activeOpacity={0.7}
          hitSlop={10}
        >
          <Text style={[styles.title, { color: TREE.palette.textPrimary }]} numberOfLines={1}>
            {treeName}
          </Text>
          <Text style={[styles.titleHint, { color: `${TREE.palette.textSecondary}cc` }]}>your tree · tap to rename</Text>
        </TouchableOpacity>
      </View>

      {/* New branch (top-right) */}
      <TouchableOpacity
        style={[styles.newBtn, { backgroundColor: TREE.nodeSurface, borderColor: TREE.palette.accentColor }]}
        onPress={() => setCreating(true)}
        activeOpacity={0.82}
      >
        <Text style={[styles.newBtnPlus, { color: TREE.palette.accentColor }]}>+</Text>
      </TouchableOpacity>

      {/* Hint if the tree is nearly bare */}
      {stalks.length <= 1 && (
        <Animated.View entering={FadeIn.delay(300)} style={styles.emptyHint} pointerEvents="none">
          <Text style={[styles.emptyHintText, { color: `${TREE.palette.textSecondary}` }]}>
            Tap a branch to open it, or grow a new one with +
          </Text>
        </Animated.View>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <CreateBranchForm visible={creating} onClose={() => setCreating(false)} onCreate={handleCreate} />

      <Modal visible={renaming} transparent animationType="none" onRequestClose={() => setRenaming(false)} statusBarTranslucent>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.renameBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenaming(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.renameKav}>
            <Animated.View
              entering={ZoomIn.springify().damping(24).stiffness(340).mass(0.5)}
              exiting={ZoomOut.duration(130)}
              style={styles.renameCard}
            >
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
                selectionColor={TREE.palette.accentColor}
              />
              <TouchableOpacity style={[styles.renameSave, { backgroundColor: TREE.palette.accentColor }]} onPress={saveTreeName} activeOpacity={0.85}>
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
  root: { flex: 1, backgroundColor: TREE.palette.backgroundEnd },

  crown: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(30,107,46,0.16)',
  },
  trunk: {
    position: 'absolute',
    width: TRUNK_W,
    borderRadius: TRUNK_W / 2,
    backgroundColor: WOOD,
  },
  rootFlare: {
    position: 'absolute',
    width: 80,
    height: 20,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    backgroundColor: WOOD_DARK,
  },

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
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 6,
  },
  nodeLeafWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nodeText: { flex: 1 },
  nodeName: { fontSize: 15, fontWeight: '700' },
  nodeCount: { fontSize: 12, fontWeight: '500', marginTop: 1 },

  // ── Header ──────────────────────────────────────────────────────────────────
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
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 6,
  },
  titleWrap: { position: 'absolute', top: 52, left: 62, right: 62, alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.2, textAlign: 'center' },
  titleHint: { fontSize: 11, textAlign: 'center', marginTop: 2 },
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
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 6,
  },
  newBtnPlus: { fontSize: 24, fontWeight: '400', lineHeight: 28 },

  emptyHint: { position: 'absolute', bottom: 40, left: 40, right: 40, alignItems: 'center' },
  emptyHintText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // ── Rename modal ──────────────────────────────────────────────────────────────
  renameBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)' },
  renameKav: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  renameCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111a12',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(86,196,100,0.25)',
    padding: 20,
    gap: 14,
  },
  renameTitle: { color: '#d4edda', fontSize: 17, fontWeight: '700' },
  renameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(86,196,100,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: '#d4edda',
  },
  renameSave: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  renameSaveLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
