import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BiomeConfig } from '@src/constants';

// ─── Branch Header ────────────────────────────────────────────────────────────
// Shown at the top of a branch's timeline. Tapping it returns to the Tree home
// (the tree is now the switcher, replacing the old stalk dropdown).

interface BranchHeaderProps {
  name: string;
  biome: BiomeConfig;
  onBack: () => void;
}

export default function BranchHeader({ name, biome, onBack }: BranchHeaderProps) {
  const { palette, nodeSurface } = biome;
  return (
    <View style={styles.container} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.pill, { backgroundColor: nodeSurface, borderColor: palette.accentColor }]}
        onPress={onBack}
        activeOpacity={0.85}
        accessibilityLabel="Back to your tree"
      >
        <Text style={[styles.chevron, { color: palette.accentColor }]}>‹</Text>
        <View style={[styles.dot, { backgroundColor: palette.accentColor }]} />
        <Text style={[styles.label, { color: palette.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  chevron: { fontSize: 22, fontWeight: '700', lineHeight: 22, marginTop: -2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
