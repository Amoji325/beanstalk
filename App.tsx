import 'react-native-gesture-handler'; // must be the first import
import 'react-native-url-polyfill/auto';
import { ClerkProvider } from '@clerk/expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StalkProvider } from './src/context/StalkContext';
import MainContainer from './src/screens/MainContainer';
import { tokenCache } from './src/utils/tokenCache';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function App() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StalkProvider>
          <StatusBar style="light" />
          <MainContainer />
        </StalkProvider>
      </GestureHandlerRootView>
    </ClerkProvider>
  );
}
