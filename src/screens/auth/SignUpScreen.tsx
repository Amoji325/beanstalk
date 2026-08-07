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
import { useSignUp } from '@clerk/expo';

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  bg:        '#0b1e0d',
  surface:   '#0f2410',
  border:    '#1e6b2e',
  accent:    '#56c464',
  textPri:   '#d4edda',
  textSec:   '#4a7a52',
  inputBg:   '#091a0c',
  error:     '#ff6b6b',
  otpBorder: '#43a047',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SignUpScreenProps {
  onSwitchToSignIn: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignUpScreen({ onSwitchToSignIn }: SignUpScreenProps) {
  // useSignUp returns { signUp, errors, fetchStatus } in the Future API.
  // Email OTP verification goes through signUp.verifications.sendEmailCode()
  // and signUp.verifications.verifyEmailCode(). Session created via finalize().
  const { signUp, fetchStatus } = useSignUp();

  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]         = useState('');
  const [step, setStep]         = useState<'credentials' | 'verify'>('credentials');
  const [error, setError]       = useState<string | null>(null);

  const loading = fetchStatus === 'fetching';

  // ── Step 1: create account and send OTP ─────────────────────────────────────

  const handleCreateAccount = async () => {
    setError(null);

    // password() creates the account with email + password in one call.
    const { error: signUpError } = await signUp.password({
      emailAddress: email.trim().toLowerCase(),
      password,
    });

    if (signUpError) {
      setError(signUpError.longMessage ?? signUpError.message);
      return;
    }

    // If status is 'missing_requirements', email verification is needed.
    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      setError(sendError.longMessage ?? sendError.message);
      return;
    }

    setStep('verify');
  };

  // ── Step 2: verify OTP and activate session ──────────────────────────────────

  const handleVerify = async () => {
    setError(null);

    const { error: verifyError } = await signUp.verifications.verifyEmailCode({
      code: code.trim(),
    });

    if (verifyError) {
      setError(verifyError.longMessage ?? verifyError.message);
      return;
    }

    if (signUp.status === 'complete') {
      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) setError(finalizeError.longMessage ?? finalizeError.message);
      // ClerkProvider detects the new session; RootGate switches to MainContainer.
    } else {
      setError('Verification incomplete. Please try again.');
    }
  };

  const canCreate = email.trim().length > 0 && password.length >= 8 && !loading;
  const canVerify = code.trim().length === 6 && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>

        {/* ── Logo ─────────────────────────────────────────────────────────── */}
        <View style={styles.logoArea}>
          <Text style={styles.logoEmoji}>🌳</Text>
          <Text style={styles.logoTitle}>Branch</Text>
          <Text style={styles.logoSub}>Your memories, growing</Text>
        </View>

        {step === 'credentials' ? (
          /* ── Step 1: credentials ─────────────────────────────────────────── */
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Plant your first seed</Text>
            <Text style={styles.cardSub}>Create your account to begin growing.</Text>

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
              placeholder="Password (min 8 characters)"
              placeholderTextColor={T.textSec}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleCreateAccount}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, !canCreate && styles.buttonDisabled]}
              onPress={handleCreateAccount}
              disabled={!canCreate}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonLabel}>Create Account</Text>
              }
            </TouchableOpacity>
          </View>
        ) : (
          /* ── Step 2: OTP verification ──────────────────────────────────── */
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Check your email</Text>
            <Text style={styles.cardSub}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>

            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="000000"
              placeholderTextColor={T.textSec}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleVerify}
              textAlign="center"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, !canVerify && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={!canVerify}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonLabel}>Verify Email</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => { setStep('credentials'); setError(null); setCode(''); }}
              activeOpacity={0.7}
            >
              <Text style={styles.backLabel}>← Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={onSwitchToSignIn} activeOpacity={0.7}>
            <Text style={styles.footerLink}>Sign In</Text>
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
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 13,
    color: T.textSec,
    marginBottom: 20,
    lineHeight: 19,
  },
  emailHighlight: {
    color: T.accent,
    fontWeight: '600',
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
  otpInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 12,
    borderColor: T.otpBorder,
    borderWidth: 2,
    paddingVertical: 18,
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
  backButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  backLabel: {
    color: T.textSec,
    fontSize: 13,
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
