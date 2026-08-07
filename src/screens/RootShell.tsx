import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useStalk } from '@src/context/StalkContext';
import TreeHome from '@src/screens/tree/TreeHome';
import MainContainer from '@src/screens/MainContainer';
import AccountMenu from '@src/components/AccountMenu';

// ─── Root Shell ───────────────────────────────────────────────────────────────
// Top-level navigation for the "Branch" app: the Tree home (all branches) zooms
// into a single branch's timeline, and back. The account menu lives here so it's
// reachable from both surfaces.

type ShellView = 'tree' | 'branch';

export default function RootShell() {
  const { setActiveStalkId, biome } = useStalk();
  const [view, setView] = useState<ShellView>('tree');
  const [accountOpen, setAccountOpen] = useState(false);

  const openBranch = useCallback(
    (id: string) => {
      setActiveStalkId(id);
      setView('branch');
    },
    [setActiveStalkId],
  );

  const backToTree = useCallback(() => setView('tree'), []);
  const openAccount = useCallback(() => setAccountOpen(true), []);

  return (
    <View style={{ flex: 1 }}>
      {view === 'tree' ? (
        <Animated.View key="tree" entering={FadeIn.duration(240)} style={{ flex: 1 }}>
          <TreeHome onOpenBranch={openBranch} onOpenAccount={openAccount} />
        </Animated.View>
      ) : (
        <Animated.View key="branch" entering={FadeIn.duration(240)} style={{ flex: 1 }}>
          <MainContainer onBackToTree={backToTree} onOpenAccount={openAccount} />
        </Animated.View>
      )}

      <AccountMenu visible={accountOpen} biome={biome} onClose={() => setAccountOpen(false)} />
    </View>
  );
}
