import 'react-native-gesture-handler'; // must be the first import
import 'react-native-url-polyfill/auto';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StalkProvider } from './src/context/StalkContext';
import MainContainer from './src/screens/MainContainer';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StalkProvider>
        <StatusBar style="light" />
        <MainContainer />
      </StalkProvider>
    </GestureHandlerRootView>
  );
}
