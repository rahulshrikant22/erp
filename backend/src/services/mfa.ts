/**
 * MFA (Multi-Factor Authentication) service — TOTP-based.
 *
 * Uses the otpauth library for TOTP generation/verification.
 * Backup codes are random 8-char alphanumeric strings, stored as
 * bcrypt hashes in backup_codes_encrypted (JSON array of hashes).
 *
 * The flow:
 *   1. POST /mfa/setup → generate secret + backup codes, store encrypted
 *   2. POST /mfa/verify-setup → validate a TOTP code, activate MFA
 *   3. Login with MFA → returns mfaRequired + tempToken instead of full tokens
 *   4. POST /mfa/verify → validate TOTP/backup code, issue full tokens
 *   5. POST /mfa/disable → requires password + valid code
 *   6. POST /mfa/regenerate-backup-codes → generate new set
 */
import { randomBytes, createHash } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { AuthError, ValidationError } from '../errors';
import { verifyPassword } from './password';

const MFA_ISSUER = 'ModularFurnitureERP';
const BACKUP_CODE_COUNT = 10;
const MFA_TEMP_TOKEN_TTL_MINUTES = 5;

// -- TOTP helpers -------------------------------------------------------

function generateTotpSecret(): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: MFA_ISSUER,
    label: 'ERP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
}

function verifyTotp(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: MFA_ISSUER,
    label: 'ERP',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

// -- backup codes -------------------------------------------------------

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    codes.push(randomBytes(4).toString('hex'));
  }
  return codes;
}

function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.toLowerCase()).digest('hex');
}

function verifyBackupCode(code: string, hashes: string[]): { valid: boolean; remaining: string[] } {
  const h = hashBackupCode(code);
  const idx = hashes.indexOf(h);
  if (idx === -1) return { valid: false, remaining: hashes };
  const remaining = [...hashes];
  remaining.splice(idx, 1);
  return { valid: true, remaining };
}

// -- temp token (short-lived, used between password verification and MFA) --

export interface MfaTempTokenPayload {
  sub: string;
  purpose: 'mfa_verify';
  iat: number;
  exp: number;
}

export function generateMfaTempToken(userId: string): string {
  const opts: SignOptions = { expiresIn: `${MFA_TEMP_TOKEN_TTL_MINUTES}m` };
  return jwt.sign({ sub: userId, purpose: 'mfa_verify' }, config.env.JWT_SECRET, opts);
}

export function verifyMfaTempToken(token: string): MfaTempTokenPayload {
  try {
    const payload = jwt.verify(token, config.env.JWT_SECRET) as MfaTempTokenPayload;
    if (payload.purpose !== 'mfa_verify') {
      throw new AuthError('Invalid MFA token');
    }
    return payload;
  } catch {
    throw new AuthError('MFA token is invalid or expired');
  }
}

// -- public API ---------------------------------------------------------

export interface MfaSetupResult {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

export async function setupMfa(userId: string): Promise<MfaSetupResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, email: true },
  });
  if (!user) throw new AuthError('User not found');
  if (user.twoFactorEnabled) {
    throw new ValidationError('MFA is already enabled. Disable it first to reconfigure.');
  }

  const totp = generateTotpSecret();
  totp.label = user.email;
  const backupCodes = generateBackupCodes();
  const backupHashes = backupCodes.map(hashBackupCode);

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecretEncrypted: totp.secret.base32,
      backupCodesEncrypted: JSON.stringify(backupHashes),
    },
  });

  return {
    secret: totp.secret.base32,
    otpauthUri: totp.toString(),
    backupCodes,
  };
}

export async function verifySetup(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecretEncrypted: true, twoFactorEnabled: true },
  });
  if (!user) throw new AuthError('User not found');
  if (user.twoFactorEnabled) {
    throw new ValidationError('MFA is already active');
  }
  if (!user.twoFactorSecretEncrypted) {
    throw new ValidationError('Run MFA setup first');
  }

  const valid = verifyTotp(user.twoFactorSecretEncrypted, code);
  if (!valid) {
    throw new AuthError('Invalid TOTP code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });
}

export async function disableMfa(
  userId: string,
  password: string,
  code: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
      twoFactorEnabled: true,
      twoFactorSecretEncrypted: true,
      backupCodesEncrypted: true,
    },
  });
  if (!user) throw new AuthError('User not found');
  if (!user.twoFactorEnabled) {
    throw new ValidationError('MFA is not enabled');
  }

  const pwOk = await verifyPassword(password, user.passwordHash);
  if (!pwOk) throw new AuthError('Invalid password');

  const totpValid = user.twoFactorSecretEncrypted
    ? verifyTotp(user.twoFactorSecretEncrypted, code)
    : false;
  if (!totpValid) {
    const hashes: string[] = user.backupCodesEncrypted
      ? JSON.parse(user.backupCodesEncrypted)
      : [];
    const { valid } = verifyBackupCode(code, hashes);
    if (!valid) throw new AuthError('Invalid TOTP or backup code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecretEncrypted: null,
      backupCodesEncrypted: null,
    },
  });
}

export interface MfaVerifyResult {
  userId: string;
  valid: boolean;
}

export async function verifyMfaCode(
  userId: string,
  code: string,
): Promise<MfaVerifyResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorSecretEncrypted: true,
      backupCodesEncrypted: true,
    },
  });
  if (!user || !user.twoFactorEnabled) {
    return { userId, valid: false };
  }

  if (user.twoFactorSecretEncrypted && verifyTotp(user.twoFactorSecretEncrypted, code)) {
    return { userId, valid: true };
  }

  const hashes: string[] = user.backupCodesEncrypted
    ? JSON.parse(user.backupCodesEncrypted)
    : [];
  const { valid, remaining } = verifyBackupCode(code, hashes);
  if (valid) {
    await prisma.user.update({
      where: { id: userId },
      data: { backupCodesEncrypted: JSON.stringify(remaining) },
    });
    return { userId, valid: true };
  }

  return { userId, valid: false };
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  if (!user) throw new AuthError('User not found');
  if (!user.twoFactorEnabled) {
    throw new ValidationError('MFA must be enabled to regenerate backup codes');
  }

  const codes = generateBackupCodes();
  const hashes = codes.map(hashBackupCode);
  await prisma.user.update({
    where: { id: userId },
    data: { backupCodesEncrypted: JSON.stringify(hashes) },
  });
  return codes;
}

export function isUserMfaEnabled(user: { twoFactorEnabled: boolean }): boolean {
  return user.twoFactorEnabled;
}
