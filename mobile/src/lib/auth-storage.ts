import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const metadataSuffix = '.secure-session';
// Keep each encrypted value comfortably below platform keychain item limits.
const chunkLimitBytes = 1500;

type SessionPointer = {
  id: string;
  count: number;
};

function utf8Size(value: string) {
  const point = value.codePointAt(0)!;
  if (point <= 0x7f) return 1;
  if (point <= 0x7ff) return 2;
  if (point <= 0xffff) return 3;
  return 4;
}

function splitIntoSecureChunks(value: string) {
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;

  for (const character of value) {
    const bytes = utf8Size(character);
    if (chunkBytes + bytes > chunkLimitBytes) {
      chunks.push(chunk);
      chunk = '';
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += bytes;
  }
  if (chunk || chunks.length === 0) chunks.push(chunk);
  return chunks;
}

function parsePointer(value: string | null): SessionPointer | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('id' in parsed)
    || typeof parsed.id !== 'string'
    || !('count' in parsed)
    || typeof parsed.count !== 'number'
    || !Number.isInteger(parsed.count)
    || parsed.count < 1
  ) {
    throw new Error('Stored sign-in data is invalid. Sign in again to continue.');
  }
  return { id: parsed.id, count: parsed.count };
}

async function removeSecureChunks(key: string, pointer: SessionPointer | null) {
  if (!pointer) return;
  await Promise.all(
    Array.from({ length: pointer.count }, (_, index) =>
      SecureStore.deleteItemAsync(`${key}.${pointer.id}.${index}`),
    ),
  );
}

async function getSecureItem(key: string): Promise<string | null> {
  const pointer = parsePointer(await SecureStore.getItemAsync(`${key}${metadataSuffix}`));
  if (pointer) {
    const chunks = await Promise.all(
      Array.from({ length: pointer.count }, (_, index) =>
        SecureStore.getItemAsync(`${key}.${pointer.id}.${index}`),
      ),
    );
    if (chunks.some((chunk) => chunk === null)) {
      throw new Error('Secure sign-in data is incomplete. Sign in again to continue.');
    }
    await AsyncStorage.removeItem(key);
    return (chunks as string[]).join('');
  }

  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue === null) return null;
  await setSecureItem(key, legacyValue);
  await AsyncStorage.removeItem(key);
  return legacyValue;
}

async function setSecureItem(key: string, value: string) {
  const metadataKey = `${key}${metadataSuffix}`;
  const previous = parsePointer(await SecureStore.getItemAsync(metadataKey));
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const chunks = splitIntoSecureChunks(value);

  await Promise.all(chunks.map((chunk, index) =>
    SecureStore.setItemAsync(`${key}.${id}.${index}`, chunk, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  ));
  await SecureStore.setItemAsync(
    metadataKey,
    JSON.stringify({ id, count: chunks.length }),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  await removeSecureChunks(key, previous);
  await AsyncStorage.removeItem(key);
}

async function removeSecureItem(key: string) {
  const metadataKey = `${key}${metadataSuffix}`;
  const pointer = parsePointer(await SecureStore.getItemAsync(metadataKey));
  await SecureStore.deleteItemAsync(metadataKey);
  await removeSecureChunks(key, pointer);
  await AsyncStorage.removeItem(key);
}

export const authStorage = {
  getItem: (key: string) => Platform.OS === 'web' ? AsyncStorage.getItem(key) : getSecureItem(key),
  setItem: (key: string, value: string) => Platform.OS === 'web'
    ? AsyncStorage.setItem(key, value)
    : setSecureItem(key, value),
  removeItem: (key: string) => Platform.OS === 'web' ? AsyncStorage.removeItem(key) : removeSecureItem(key),
};
