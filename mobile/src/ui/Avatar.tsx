import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

export interface PhotoSource {
  uri: string;
  /** Private photos are fetched with the signed-in account's token. */
  headers?: Record<string, string>;
}

/** Soft backgrounds with dark ink, so initials read well in both themes. */
const PALETTE = [
  { bg: '#d6ebe9', fg: '#0a4b4e' },
  { bg: '#fbe6b8', fg: '#5a3a00' },
  { bg: '#d9e6f7', fg: '#1d4f86' },
  { bg: '#f6d9d4', fg: '#8a2a20' },
  { bg: '#e4dbf3', fg: '#52358a' },
  { bg: '#d8eddd', fg: '#175c34' },
] as const;

/** A colour fixed by the name, so the same person always gets the same one. */
export function avatarColors(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/** "Diya Nadeem Iyer" -> "DI" (first and last name). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

interface AvatarProps {
  name: string;
  size?: number;
  photo?: PhotoSource | null;
}

/** A photo, or the initials on a colour fixed by the name. */
export function Avatar({ name, size = 40, photo }: AvatarProps) {
  const { bg, fg } = avatarColors(name);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Photo of ${name}`}
      style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
    >
      {photo ? (
        <Image
          source={photo}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
          recyclingKey={photo.uri}
        />
      ) : (
        <Text
          variant="bodyStrong"
          maxFontSizeMultiplier={1.2}
          style={{ color: fg, fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.5) }}
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
