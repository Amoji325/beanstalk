import React, { useState } from 'react';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';

type AuthMode = 'signIn' | 'signUp';

export default function AuthNavigator() {
  const [mode, setMode] = useState<AuthMode>('signIn');

  if (mode === 'signUp') {
    return <SignUpScreen onSwitchToSignIn={() => setMode('signIn')} />;
  }

  return <SignInScreen onSwitchToSignUp={() => setMode('signUp')} />;
}
