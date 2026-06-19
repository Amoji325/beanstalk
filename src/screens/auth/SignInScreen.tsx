import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSignIn } from '@clerk/expo';

// ─── Theme ────────────────────────────────────────────────────────────────────
// Locked to Standard / Daily Garden palette — user hasn't chosen a biome yet.

const T = {
  bg:      '#0b1e0d',
  surface: '#0f2410',
  border:  '#1e6b2e',
  accent:  '#56c464',
  textPri: '#d4edda',
  textSec: '#4a7a52',
  inputBg: '#091a0c',
  error:   '#ff6b6b',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SignInScreenProps {
  onSwitchToSignUp: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignInScreen({ onSwitchToSignUp }: SignInScreenProps) {
  // useSignIn returns { signIn, errors, fetchStatus } in the Future API.
  // No isLoaded / setActive — use signIn.finalize() to activate the session.
  const { signIn, fetchStatus } = useSignIn();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);

  const loading = fetchStatus === 'fetching';

  const handleSignIn = async () => {
    setError(null);

    // Submit identifier + password together; a single call completes the flow.
    const { error: createError } = await signIn.create({
      identifier: email.trim().toLowerCase(),
      password,
    });

    if (createError) {
      setError(createError.longMessage ?? createError.message);
      return;
    }

    if (signIn.status === 'complete') {
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) setError(finalizeError.longMessage ?? finalizeError.message);
      // On success, ClerkProvider observes the new session and RootGate
      // re-renders automatically — no manual navigation needed.
    } else {
      setError('Sign-in could not be completed. Please try again.');
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>

        {/* ── Logo ─────────────────────────────────────────────────────────── */}
        <View style={styles.logoArea}>
          <Text style={styles.logoEmoji}>🌱</Text>
          <Text style={styles.logoTitle}>Beanstalk</Text>
          <Text style={styles.logoSub}>Your living journal</Text>
        </View>

        {/* ── Card ─────────────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={T.textSec}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={T.textSec}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignIn}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonLabel}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={onSwitchToSignUp} activeOpacity={0.7}>
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoEmoji: {
    fontSize: 52,
    marginBottom: 8,
  },
  logoTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: T.textPri,
    letterSpacing: 0.5,
  },
  logoSub: {
    fontSize: 14,
    color: T.textSec,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: T.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: T.border,
    padding: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: T.textPri,
    marginBottom: 20,
  },
  input: {
    backgroundColor: T.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: T.textPri,
    marginBottom: 12,
  },
  errorText: {
    color: T.error,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  button: {
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  footerText: {
    color: T.textSec,
    fontSize: 14,
  },
  footerLink: {
    color: T.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
