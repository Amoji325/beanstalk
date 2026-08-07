import React, { useCallback, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useStalk } from '@src/context/StalkContext';
import TreeHome from '@src/screens/tree/TreeHome';
import MainContainer from '@src/screens/MainContainer';
import AccountMenu from '@src/components/AccountMenu';
import {
  ZOOM_BRANCH_FADE_END,
  ZOOM_BRANCH_SCALE_FROM,
  ZOOM_TREE_FADE_END,
  ZOOM_TREE_SCALE,
} from '@src/screens/tree/zoomTransition';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DURATION = 460;

// ─── Root Shell ───────────────────────────────────────────────────────────────
// Top-level navigation for "Branch": the Tree home zooms into a single branch's
// timeline (pivoting on the tapped branch), and reverses on back. Both layers
// are mounted only during the transition; at rest just one is. The account menu
// lives here so it's reachable from both surfaces.

export default function RootShell() {
  const { setActiveStalkId, biome } = useStalk();

  const [showTree, setShowTree] = useState(true);
  const [showBranch, setShowBranch] = useState(false);
  const [target, setTarget] = useState<'tree' | 'branch'>('tree');
  const [accountOpen, setAccountOpen] = useState(false);
  const [origin, setOrigin] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });

  const t = useSharedValue(0); // 0 = tree, 1 = branch

  const openBranch = useCallback(
    (id: string, x?: number, y?: number) => {
      setOrigin({ x: x ?? SCREEN_WIDTH / 2, y: y ?? SCREEN_HEIGHT / 2 });
      setActiveStalkId(id);
      setShowBranch(true);
      setTarget('branch');
      t.value = 0;
      t.value = withTiming(1, { duration: DURATION, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setShowTree)(false);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setActiveStalkId],
  );

  const backToTree = useCallback(() => {
    setShowTree(true);
    setTarget('tree');
    t.value = 1;
    t.value = withTiming(0, { duration: DURATION, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setShowBranch)(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAccount = useCallback(() => setAccountOpen(true), []);

  const treeStyle = useAnimatedStyle(() => {
    'worklet';
    const c = t.value;
    return {
      opacity: 1 - Math.min(1, c / ZOOM_TREE_FADE_END),
      transform: [{ scale: 1 + c * (ZOOM_TREE_SCALE - 1) }],
    };
  });

  const branchStyle = useAnimatedStyle(() => {
    'worklet';
    const c = t.value;
    return {
      opacity: Math.min(1, c / ZOOM_BRANCH_FADE_END),
      transform: [{ scale: ZOOM_BRANCH_SCALE_FROM + c * (1 - ZOOM_BRANCH_SCALE_FROM) }],
    };
  });

  // Both layers pivot on the tapped branch's location.
  const originStyle = { transformOrigin: [origin.x, origin.y, 0] as [number, number, number] };

  return (
    <View style={{ flex: 1 }}>
      {showTree && (
        <Animated.View
          style={[StyleSheet.absoluteFill, originStyle, treeStyle]}
          pointerEvents={target === 'tree' ? 'auto' : 'none'}
        >
          <TreeHome onOpenBranch={openBranch} onOpenAccount={openAccount} />
        </Animated.View>
      )}

      {showBranch && (
        <Animated.View
          style={[StyleSheet.absoluteFill, originStyle, branchStyle]}
          pointerEvents={target === 'branch' ? 'auto' : 'none'}
        >
          <MainContainer onBackToTree={backToTree} onOpenAccount={openAccount} />
        </Animated.View>
      )}

      <AccountMenu visible={accountOpen} biome={biome} onClose={() => setAccountOpen(false)} />
    </View>
  );
}
