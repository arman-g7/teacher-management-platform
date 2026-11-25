import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
function scrypt(value: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    derive(value, salt, 64, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  );
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(value: string) {
  const salt = randomBytes(24).toString('hex');
  return salt + ':' + (await scrypt(value, salt)).toString('hex');
}
export async function verifyPassword(value: string, hash?: string) {
  const [salt, key] = (hash ?? '0'.repeat(48) + ':' + '0'.repeat(128)).split(':');
  const actual = await scrypt(value, salt);
  return timingSafeEqual(actual, Buffer.from(key, 'hex')) && Boolean(hash);
}
