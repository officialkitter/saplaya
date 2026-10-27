import { sha256 } from '@noble/hashes/sha2.js';

const runtimeCrypto = globalThis.crypto;
const runtimeSubtle = runtimeCrypto?.subtle;
const secureRandomValues: Crypto['getRandomValues'] = runtimeCrypto?.getRandomValues
  ? runtimeCrypto.getRandomValues.bind(runtimeCrypto)
  : (array) => {
      throw new Error('Secure random number generation is unavailable. Update Saplaya to sign in securely.');
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
