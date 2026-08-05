import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useAuth, useUser } from '@clerk/expo';
import { supabase } from '@src/lib/supabase';
import { LadybugIcon } from '@src/components/HistoryVine';
import type { BiomeConfig } from '@src/constants';

// ─── Avatar options ───────────────────────────────────────────────────────────

export const AVATAR_KINDS = ['initial', 'leaf', 'flower', 'ladybug'] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

type ClerkUserLike = {
  firstName?: string | null;
  fullName?: string | null;
  username?: string | null;
  unsafeMetadata?: Record<string, unknown> | null;
  primaryEmailAddress?: { emailAddress?: string } | null;
} | null | undefined;

/** First initial for the avatar — from name, else email, else a dot. */
export function accountInitial(user: ClerkUserLike): string {
  const source =
    user?.firstName || user?.fullName || user?.primaryEmailAddress?.emailAddress || '';
  return source.trim().charAt(0).toUpperCase() || '·';
}

/** The user's chosen avatar icon (stored in Clerk unsafeMetadata). */
export function avatarKind(user: ClerkUserLike): AvatarKind {
  const k = user?.unsafeMetadata?.avatarIcon;
  return (AVATAR_KINDS as readonly string[]).includes(k as string) ? (k as AvatarKind) : 'initial';
}

// ─── Drawn glyphs (no emoji / icon font) ──────────────────────────────────────

function LeafGlyph({ color, bg, size }: { color: string; bg?: string; size: number }) {
  // Everything is placed by its centre relative to the box centre — no
  // whole-shape rotation — so the leaf (body + stem + midrib + veins) stays
  // perfectly centred. The leaf points along the "/" diagonal (tip upper-right,
  // base lower-left). Veins use the surrounding background colour for contrast.
  const S = size;
  const c = S / 2;
  const d = Math.round(S * 0.54);
  const veinC = bg ?? 'rgba(0,0,0,0.25)';
  const vW = Math.max(1.5, S * 0.045);
  const stemLen = Math.round(S * 0.22);
  const stemW = Math.max(2, Math.round(S * 0.06));

  const ux = Math.SQRT1_2; // axis toward tip (upper-right): (0.707, -0.707)
  const uy = -Math.SQRT1_2;

  const bar = (cxp: number, cyp: number, len: number, thick: number, deg: number, col: string) =>
    ({
      position: 'absolute' as const,
      left: cxp - len / 2,
      top: cyp - thick / 2,
      width: len,
      height: thick,
      borderRadius: thick / 2,
      backgroundColor: col,
      transform: [{ rotate: `${deg}deg` }],
    });

  // Base (lower-left) point + stem extending outward from it.
  const baseX = c - ux * (d * 0.46);
  const baseY = c - uy * (d * 0.46);

  // Side vein fanning from the centre toward the tip at the given screen angle.
  const sideVein = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    const len = d * 0.5;
    return bar(c + Math.cos(r) * (len / 2), c + Math.sin(r) * (len / 2), len, vW, deg, veinC);
  };

  return (
    <View style={{ width: S, height: S }}>
      {/* Stem (behind the body) */}
      <View style={bar(baseX - ux * (stemLen / 2), baseY - uy * (stemLen / 2), stemLen, stemW, -45, color)} />
      {/* Leaf body — vesica via corner radii (points at upper-right & lower-left) */}
      <View
        style={{
          position: 'absolute',
          top: c - d / 2,
          left: c - d / 2,
          width: d,
          height: d,
          backgroundColor: color,
          borderTopLeftRadius: d,
          borderBottomRightRadius: d,
          borderTopRightRadius: Math.round(d * 0.12),
          borderBottomLeftRadius: Math.round(d * 0.12),
        }}
      />
      {/* Midrib */}
      <View style={bar(c, c, d, vW, -45, veinC)} />
      {/* Two side veins, symmetric about the midrib */}
      <View style={sideVein(-15)} />
      <View style={sideVein(-75)} />
    </View>
  );
}

function FlowerGlyph({ color, size }: { color: string; size: number }) {
  const petal = Math.round(size * 0.3);
  const R = Math.round(size * 0.2);
  return (
    <View style={{ width: size, height: size }}>
      {[0, 72, 144, 216, 288].map((a) => (
        <View
          key={a}
          style={{
            position: 'absolute',
            top: size / 2 - petal / 2,
            left: size / 2 - petal / 2,
            width: petal,
            height: petal,
            borderRadius: petal / 2,
            backgroundColor: color,
            transform: [{ rotate: `${a}deg` }, { translateY: -R }],
          }}
        />
      ))}
    </View>
  );
}

export function AccountAvatarGlyph({
  kind,
  initial,
  color,
  size,
  bg,
}: {
  kind: AvatarKind;
  initial: string;
  color: string;
  size: number;
  /** Surrounding background — used for contrasting leaf veins. */
  bg?: string;
}) {
  switch (kind) {
    case 'leaf':
      return <LeafGlyph color={color} bg={bg} size={size} />;
    case 'flower':
      return <FlowerGlyph color={color} size={size} />;
    case 'ladybug':
      return <LadybugIcon active outlineColor="#1a0000" bodySize={Math.round(size * 0.78)} />;
    case 'initial':
    default:
      return (
        <Text style={{ color, fontSize: Math.round(size * 0.52), fontWeight: '800' }}>{initial}</Text>
      );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMemberSince(date: Date | null | undefined): string {
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function clerkError(e: any, fallback: string): string {
  return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || fallback;
}

type Screen = 'main' | 'email' | 'password' | 'icon';

// ─── Account Menu ─────────────────────────────────────────────────────────────

interface AccountMenuProps {
  visible: boolean;
  biome: BiomeConfig;
  onClose: () => void;
}

export default function AccountMenu({ visible, biome, onClose }: AccountMenuProps) {
  const { palette, nodeSurface } = biome;
  const { signOut } = useAuth();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>('main');

  // Email change flow
  const [emailStep, setEmailStep] = useState<'enter' | 'code'>('enter');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const pendingEmailRef = useRef<any>(null);

  // Password change flow
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const name = user?.fullName || user?.firstName || user?.username || 'Gardener';
  const kind = avatarKind(user);
  const initial = accountInitial(user);

  const resetFlows = () => {
    setScreen('main');
    setEmailStep('enter');
    setNewEmail('');
    setEmailCode('');
    setCurrentPassword('');
    setNewPassword('');
    pendingEmailRef.current = null;
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    resetFlows();
    onClose();
  };

  // ── Log out / delete ────────────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert('Log out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          handleClose();
          try {
            await signOut();
          } catch (e) {
            console.warn('[Account] sign out failed:', e);
          }
        },
      },
    ]);
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      try {
        await supabase.functions.invoke('account-deletion-email', {
          body: { email, firstName: user?.firstName ?? null },
        });
      } catch (e) {
        console.warn('[Account] deletion email failed (continuing):', e);
      }
      if (user?.id) await supabase.from('beans').delete().eq('user_id', user.id);
      await user?.delete();
    } catch (e) {
      setBusy(false);
      Alert.alert('Couldn’t delete account', clerkError(e, 'Please try again in a moment.'));
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete account permanently?',
      'This erases your account and all your beans for good. This cannot be undone. A confirmation email will be sent to you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: doDelete },
      ],
    );
  };

  // ── Change email ──────────────────────────────────────────────────────────────

  const sendEmailCode = async () => {
    const value = newEmail.trim();
    if (!value || !user) return;
    setBusy(true);
    try {
      const created = await user.createEmailAddress({ email: value });
      await created.prepareVerification({ strategy: 'email_code' });
      pendingEmailRef.current = created;
      setEmailStep('code');
    } catch (e) {
      Alert.alert('Couldn’t add that email', clerkError(e, 'Please check the address and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    const created = pendingEmailRef.current;
    if (!created || !user) return;
    setBusy(true);
    try {
      await created.attemptVerification({ code: emailCode.trim() });
      // Promote the new address to primary, then remove the old ones.
      await user.update({ primaryEmailAddressId: created.id });
      for (const addr of user.emailAddresses) {
        if (addr.id !== created.id) await addr.destroy().catch(() => {});
      }
      await user.reload();
      resetFlows();
      Alert.alert('Email updated', 'Your email address has been changed.');
    } catch (e) {
      setBusy(false);
      Alert.alert('Verification failed', clerkError(e, 'That code didn’t work. Try again.'));
    }
  };

  // ── Change password ─────────────────────────────────────────────────────────

  const submitPassword = async () => {
    if (!user) return;
    if (newPassword.trim().length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await user.updatePassword({
        currentPassword: currentPassword,
        newPassword: newPassword,
      });
      resetFlows();
      Alert.alert('Password updated', 'Your password has been changed.');
    } catch (e) {
      setBusy(false);
      Alert.alert('Couldn’t update password', clerkError(e, 'Please check your current password.'));
    }
  };

  // ── Change icon ─────────────────────────────────────────────────────────────

  const selectIcon = async (next: AvatarKind) => {
    if (!user || busy) return;
    setBusy(true);
    try {
      await user.updateMetadata({ unsafeMetadata: { avatarIcon: next } });
      await user.reload();
    } catch (e) {
      Alert.alert('Couldn’t save icon', clerkError(e, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const Header = ({ title, back }: { title: string; back?: boolean }) => (
    <View style={styles.header}>
      {back ? (
        <TouchableOpacity onPress={() => !busy && setScreen('main')} hitSlop={12} disabled={busy}>
          <Text style={[styles.backIcon, { color: palette.textSecondary }]}>‹</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 14 }} />
      )}
      <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>{title}</Text>
      <TouchableOpacity onPress={handleClose} hitSlop={12} disabled={busy}>
        <Text style={[styles.closeIcon, { color: palette.textSecondary }]}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  const fieldStyle = [
    styles.input,
    { color: palette.textPrimary, borderColor: `${palette.textSecondary}44`, backgroundColor: `${palette.textPrimary}08` },
  ];
  const primaryBtn = [styles.primaryBtn, { backgroundColor: palette.accentColor }];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View style={styles.backdrop} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View
            entering={ZoomIn.springify().damping(24).stiffness(340).mass(0.5)}
            exiting={ZoomOut.duration(130)}
            style={[styles.card, { backgroundColor: nodeSurface, borderColor: `${palette.accentColor}55` }]}
          >
            {/* ── Main ────────────────────────────────────────────────────────── */}
            {screen === 'main' && (
              <>
                <Header title="Account" />

                <View style={styles.identity}>
                  {/* Tap the avatar to change your icon */}
                  <TouchableOpacity
                    style={[styles.avatar, { backgroundColor: palette.accentColor, borderColor: `${palette.textPrimary}33` }]}
                    onPress={() => setScreen('icon')}
                    activeOpacity={0.8}
                  >
                    <AccountAvatarGlyph kind={kind} initial={initial} color={nodeSurface} bg={palette.accentColor} size={52} />
                  </TouchableOpacity>
                  <View style={styles.identityText}>
                    <Text style={[styles.name, { color: palette.textPrimary }]} numberOfLines={1}>{name}</Text>
                    <Text style={[styles.emailLine, { color: palette.textSecondary }]} numberOfLines={1}>
                      {email ?? 'No email on file'}
                    </Text>
                    <Text style={[styles.tapHint, { color: `${palette.textSecondary}cc` }]}>Tap your icon to change it</Text>
                  </View>
                </View>

                <View style={[styles.infoBox, { borderColor: `${palette.textSecondary}33` }]}>
                  <InfoRow label="Email" value={email ?? '—'} palette={palette} />
                  <View style={[styles.rowDivider, { backgroundColor: `${palette.textSecondary}22` }]} />
                  <InfoRow label="Member since" value={fmtMemberSince(user?.createdAt)} palette={palette} />
                </View>

                <MenuRow label="Change email" palette={palette} onPress={() => setScreen('email')} />
                <MenuRow label="Change password" palette={palette} onPress={() => setScreen('password')} />

                <TouchableOpacity
                  style={[styles.outlineBtn, { borderColor: `${palette.textSecondary}66` }]}
                  onPress={handleLogout}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.outlineLabel, { color: palette.textPrimary }]}>Log out</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.outlineBtn, { borderColor: `${DANGER}66` }]}
                  onPress={handleDelete}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.outlineLabel, { color: DANGER }]}>Delete account permanently</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Change email ────────────────────────────────────────────────── */}
            {screen === 'email' && (
              <>
                <Header title="Change email" back />
                {emailStep === 'enter' ? (
                  <>
                    <Text style={[styles.hint, { color: palette.textSecondary }]}>
                      Enter a new email address. We’ll send a verification code to confirm it.
                    </Text>
                    <TextInput
                      style={fieldStyle}
                      placeholder="new@email.com"
                      placeholderTextColor={`${palette.textSecondary}66`}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoFocus
                      editable={!busy}
                    />
                    <TouchableOpacity style={primaryBtn} onPress={sendEmailCode} disabled={busy} activeOpacity={0.85}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Send code</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={[styles.hint, { color: palette.textSecondary }]}>
                      Enter the 6-digit code sent to {newEmail.trim()}.
                    </Text>
                    <TextInput
                      style={fieldStyle}
                      placeholder="123456"
                      placeholderTextColor={`${palette.textSecondary}66`}
                      value={emailCode}
                      onChangeText={setEmailCode}
                      keyboardType="number-pad"
                      autoFocus
                      editable={!busy}
                    />
                    <TouchableOpacity style={primaryBtn} onPress={verifyEmailCode} disabled={busy} activeOpacity={0.85}>
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Verify & save</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            {/* ── Change password ─────────────────────────────────────────────── */}
            {screen === 'password' && (
              <>
                <Header title="Change password" back />
                <TextInput
                  style={fieldStyle}
                  placeholder="Current password"
                  placeholderTextColor={`${palette.textSecondary}66`}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!busy}
                />
                <TextInput
                  style={fieldStyle}
                  placeholder="New password (min 8 chars)"
                  placeholderTextColor={`${palette.textSecondary}66`}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!busy}
                />
                <TouchableOpacity style={primaryBtn} onPress={submitPassword} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>Update password</Text>}
                </TouchableOpacity>
              </>
            )}

            {/* ── Change icon ─────────────────────────────────────────────────── */}
            {screen === 'icon' && (
              <>
                <Header title="Choose an icon" back />
                <View style={styles.iconGrid}>
                  {AVATAR_KINDS.map((k) => {
                    const selected = k === kind;
                    return (
                      <TouchableOpacity
                        key={k}
                        onPress={() => selectIcon(k)}
                        activeOpacity={0.8}
                        disabled={busy}
                        style={[
                          styles.iconOption,
                          {
                            backgroundColor: palette.accentColor,
                            borderColor: selected ? palette.textPrimary : 'transparent',
                          },
                        ]}
                      >
                        <AccountAvatarGlyph kind={k} initial={initial} color={nodeSurface} bg={palette.accentColor} size={46} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.hint, { color: palette.textSecondary }]}>
                  Tap an icon to use it as your avatar.
                </Text>
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

function InfoRow({ label, value, palette }: { label: string; value: string; palette: BiomeConfig['palette'] }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: palette.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: palette.textPrimary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function MenuRow({ label, palette, onPress }: { label: string; palette: BiomeConfig['palette']; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.menuRow, { borderColor: `${palette.textSecondary}33` }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.menuRowLabel, { color: palette.textPrimary }]}>{label}</Text>
      <Text style={[styles.menuRowChevron, { color: palette.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );
}

const DANGER = '#E5484D';

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kav: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backIcon: { fontSize: 26, fontWeight: '600', lineHeight: 26, width: 14 },
  headerTitle: { fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
  closeIcon: { fontSize: 18, fontWeight: '600' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700' },
  emailLine: { fontSize: 13 },
  tapHint: { fontSize: 11, fontStyle: 'italic' },

  infoBox: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, gap: 12 },
  rowDivider: { height: StyleSheet.hairlineWidth },
  infoLabel: { fontSize: 13, fontWeight: '500' },
  infoValue: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  menuRowLabel: { fontSize: 15, fontWeight: '600' },
  menuRowChevron: { fontSize: 20, fontWeight: '400' },

  outlineBtn: { paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, alignItems: 'center' },
  outlineLabel: { fontSize: 15, fontWeight: '700' },

  hint: { fontSize: 13, lineHeight: 19 },
  input: {
    width: '100%',
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  primaryBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  primaryLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, paddingVertical: 4 },
  iconOption: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
