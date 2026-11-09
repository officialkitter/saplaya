import { sha256 } from '@noble/hashes/sha2.js';
import { getRandomValues as getNativeRandomValues } from 'expo-crypto';
import { Platform } from 'react-native';

const runtimeCrypto = globalThis.crypto;
const runtimeSubtle = runtimeCrypto?.subtle;
const secureRandomValues: Crypto['getRandomValues'] = runtimeCrypto?.getRandomValues
  ? runtimeCrypto.getRandomValues.bind(runtimeCrypto)
  : (array) => {
      if (Platform.OS === 'web') {
        throw new Error('Secure random number generation is unavailable. Update Saplaya to sign in securely.');
      }
      if (!ArrayBuffer.isView(array) || array instanceof DataView ||
          array instanceof Float32Array || array instanceof Float64Array) {
        throw new TypeError('Expected an integer typed array.');
      }
      if (array.byteLength > 65536) {
        throw new Error('Random values cannot exceed 65536 bytes.');
      }
      getNativeRandomValues(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      return array;
    };

const subtle = Object.create(runtimeSubtle ?? null) as SubtleCrypto;
Object.defineProperty(subtle, 'digest', {
  configurable: true,
  value: async (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
    const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
    if (name.toUpperCase() !== 'SHA-256') {
      throw new Error(`Unsupported secure digest algorithm: ${name}`);
    }

    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null;
    if (!bytes) throw new TypeError('Digest input must be an ArrayBuffer or typed-array view.');

    const digest = sha256(bytes);
    return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength) as ArrayBuffer;
  },
});

const cryptoPolyfill = Object.create(runtimeCrypto ?? null) as Crypto;
Object.defineProperties(cryptoPolyfill, {
  getRandomValues: { configurable: true, value: secureRandomValues },
  subtle: { configurable: true, value: subtle },
});

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: cryptoPolyfill,
});
