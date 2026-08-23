import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  generateRollCode,
  isValidRollCode,
  safeEqual,
  signValue,
  verifySignedValue,
} from './crypto.js';

describe('secret encryption', () => {
  it('round-trips a refresh token', () => {
    const token = '1//0eXaMPle-refresh-token_value';
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('produces a different ciphertext each time', () => {
    // A fixed nonce would leak that the same token was stored twice.
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('refuses to decrypt tampered ciphertext', () => {
    const encrypted = encryptSecret('sensitive');
    const [iv, body, tag] = encrypted.split('.');
    const flipped = Buffer.from(body!, 'base64url');
    flipped.writeUInt8(flipped.readUInt8(0) ^ 0xff, 0);
    expect(() => decryptSecret([iv, flipped.toString('base64url'), tag].join('.'))).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptSecret('nonsense')).toThrow('Malformed encrypted payload');
  });
});

describe('signed values', () => {
  it('accepts its own signature', () => {
    expect(verifySignedValue(signValue('admin:123'))).toBe('admin:123');
  });

  it('rejects a forged signature', () => {
    expect(verifySignedValue('admin:123.deadbeef')).toBeNull();
    expect(verifySignedValue('admin:999')).toBeNull();
  });

  it('rejects a modified payload under a valid-looking signature', () => {
    const signed = signValue('admin:1');
    const forged = signed.replace('admin:1', 'admin:2');
    expect(verifySignedValue(forged)).toBeNull();
  });
});

describe('safeEqual', () => {
  it('compares without leaking length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('short', 'much longer value')).toBe(false);
  });
});

describe('roll codes', () => {
  it('only uses unambiguous characters', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateRollCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    }
  });

  it('does not repeat across many draws', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateRollCode()));
    expect(codes.size).toBe(2000);
  });

  it('validates the shape of untrusted codes', () => {
    expect(isValidRollCode(generateRollCode())).toBe(true);
    expect(isValidRollCode('abc')).toBe(false); // lowercase
    expect(isValidRollCode('AB')).toBe(false); // too short
    expect(isValidRollCode('A'.repeat(40))).toBe(false); // too long
    expect(isValidRollCode('ABCDEF01')).toBe(false); // excluded digits
    expect(isValidRollCode('../../ETC')).toBe(false);
  });
});
