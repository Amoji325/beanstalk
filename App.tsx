import 'react-native-gesture-handler'; // must be the first import
import 'react-native-url-polyfill/auto';
import { ClerkProvider, useAuth } from '@clerk/expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { StalkProvider } from './src/context/StalkContext';
import RootShell from './src/screens/RootShell';
import AuthNavigator from './src/screens/auth/AuthNavigator';
import { tokenCache } from './src/utils/tokenCache';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

// ─── Root gate ────────────────────────────────────────────────────────────────
// Must be a child of ClerkProvider so it can call useAuth().

function RootGate() {
  const { isLoaded, isSignedIn } = useAuth();

  // Clerk is hydrating — show a blank dark screen rather than a flash of UI.
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b1e0d', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#56c464" />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        <StatusBar style="light" />
        <AuthNavigator />
      </>
    );
  }

  return (
    <StalkProvider>
      <StatusBar style="light" />
      <RootShell />
    </StalkProvider>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <RootGate />
      </GestureHandlerRootView>
    </ClerkProvider>
  );
}
