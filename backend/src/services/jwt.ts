/**
 * JWT service — issues and verifies access + refresh tokens.
 *
 * Access token  (15min default):  signed with JWT_SECRET.
 *   { sub: userId, ut: 'internal'|'external', jti, iat, exp }
 *
 * Refresh token (7d default):     signed with JWT_REFRESH_SECRET.
 *   { sub: userId, ut, sid, jti, iat, exp }
 *   `sid` is the user_sessions row id; the row stores the SHA-256 hash of
 *   the full refresh-token string so we can revoke individual sessions
 *   without needing the original token value.
 */
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config';
import { AuthError } from '../errors';

export type UserType = 'internal' | 'external';

export interface AccessTokenPayload {
  sub: string;
  ut: UserType;
  sid: string;
  jti: string;
  iat: number;
  exp: number;
}

export type RefreshTokenPayload = AccessTokenPayload;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

const ACCESS_TTL_MIN = config.env.AUTH_ACCESS_TOKEN_TTL_MINUTES;
const REFRESH_TTL_DAYS = config.env.AUTH_REFRESH_TOKEN_TTL_DAYS;

export function hashRefreshToken(token: string): string {
  // SHA-256 is fine here: the token itself has 128+ bits of entropy from JWT
  // signing, so we don't need bcrypt's slow hashing. We just need a
  // deterministic, irreversible fingerprint to compare against on refresh.
  return createHash('sha256').update(token).digest('hex');
}

export interface GenerateTokenInput {
  userId: string;
  userType: UserType;
  sessionId: string;
}

export function generateTokenPair(input: GenerateTokenInput): TokenPair {
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MIN * 60 * 1000);
  const refreshExpiresAt = new Date(
    now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const accessOpts: SignOptions = {
    expiresIn: `${ACCESS_TTL_MIN}m`,
    jwtid: randomUUID(),
  };
  const refreshOpts: SignOptions = {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
    jwtid: randomUUID(),
  };

  const accessToken = jwt.sign(
    { sub: input.userId, ut: input.userType, sid: input.sessionId },
    config.env.JWT_SECRET,
    accessOpts,
  );
  const refreshToken = jwt.sign(
    { sub: input.userId, ut: input.userType, sid: input.sessionId },
    config.env.JWT_REFRESH_SECRET,
    refreshOpts,
  );

  return {
    accessToken,
    refreshToken,
    refreshTokenHash: hashRefreshToken(refreshToken),
    accessExpiresAt,
    refreshExpiresAt,
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, config.env.JWT_SECRET) as AccessTokenPayload;
  } catch (err) {
    throw new AuthError('Invalid or expired access token', undefined);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, config.env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch (err) {
    throw new AuthError('Invalid or expired refresh token', undefined);
  }
}

/** True when the refresh token has less than this many days left. Used to rotate proactively. */
export function isRefreshNearExpiry(payload: RefreshTokenPayload, thresholdDays = 1): boolean {
  const remainingMs = payload.exp * 1000 - Date.now();
  return remainingMs < thresholdDays * 24 * 60 * 60 * 1000;
}
