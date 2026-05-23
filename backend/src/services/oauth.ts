/**
 * OAuth/OIDC foundation — Google and Microsoft provider support.
 *
 * Flow:
 *   1. GET /api/auth/oauth/:provider/start → redirect to provider authorize URL
 *   2. GET /api/auth/oauth/:provider/callback → exchange code, upsert connection, issue tokens
 *
 * Providers are stored in core.oauth_providers (admin-configurable). The provider
 * code determines which OIDC well-known configuration to use.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { AuthError, NotFoundError } from '../errors';
import { generateTokenPair } from './jwt';
import { logger } from '../utils/logger';

interface OidcConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes: string[];
}

const OIDC_CONFIGS: Record<string, OidcConfig> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  microsoft: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
};

export function isSupportedOAuthProvider(code: string): boolean {
  return code in OIDC_CONFIGS;
}

export interface OAuthStartResult {
  redirectUrl: string;
  state: string;
}

export async function startOAuth(providerCode: string): Promise<OAuthStartResult> {
  const oidc = OIDC_CONFIGS[providerCode];
  if (!oidc) throw new AuthError(`Unsupported OAuth provider: ${providerCode}`);

  const provider = await prisma.oauthProvider.findFirst({
    where: { providerCode, isActive: true },
  });
  if (!provider) {
    throw new NotFoundError(`OAuth provider "${providerCode}" is not configured or inactive`);
  }

  const state = randomBytes(32).toString('hex');
  const callbackUrl = `${config.env.FRONTEND_URL}/auth/oauth/${providerCode}/callback`;

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: oidc.scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return {
    redirectUrl: `${oidc.authorizeUrl}?${params.toString()}`,
    state,
  };
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

interface OAuthUserInfo {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

async function exchangeCode(
  providerCode: string,
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<OAuthTokenResponse> {
  const oidc = OIDC_CONFIGS[providerCode]!;
  const callbackUrl = `${config.env.FRONTEND_URL}/auth/oauth/${providerCode}/callback`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(oidc.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.warn({ providerCode, status: res.status, body: text }, 'OAuth token exchange failed');
    throw new AuthError('Failed to exchange authorization code');
  }

  return res.json() as Promise<OAuthTokenResponse>;
}

async function fetchUserInfo(
  providerCode: string,
  accessToken: string,
): Promise<OAuthUserInfo> {
  const oidc = OIDC_CONFIGS[providerCode]!;
  const res = await fetch(oidc.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new AuthError('Failed to fetch user info from OAuth provider');
  }

  return res.json() as Promise<OAuthUserInfo>;
}

export interface OAuthCallbackResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
    isActive: boolean;
    twoFactorEnabled: boolean;
  };
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  sessionId: string;
  isNewConnection: boolean;
}

export async function handleOAuthCallback(
  providerCode: string,
  code: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<OAuthCallbackResult> {
  const oidc = OIDC_CONFIGS[providerCode];
  if (!oidc) throw new AuthError(`Unsupported OAuth provider: ${providerCode}`);

  const provider = await prisma.oauthProvider.findFirst({
    where: { providerCode, isActive: true },
  });
  if (!provider) {
    throw new NotFoundError(`OAuth provider "${providerCode}" is not configured`);
  }

  const tokenData = await exchangeCode(
    providerCode,
    code,
    provider.clientId,
    provider.clientSecretEncrypted, // In production this would be decrypted
  );

  const userInfo = await fetchUserInfo(providerCode, tokenData.access_token);
  if (!userInfo.email) {
    throw new AuthError('OAuth provider did not return an email address');
  }

  const email = userInfo.email.toLowerCase().trim();

  // Check if there's an existing connection for this provider user
  let connection = await prisma.oauthConnection.findFirst({
    where: { providerId: provider.id, providerUserId: userInfo.sub },
    include: { user: true },
  });

  let isNewConnection = false;

  if (!connection) {
    // Try to match by email
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (!existingUser) {
      throw new AuthError(
        'No existing account found for this email. Please contact an administrator.',
      );
    }
    if (!existingUser.isActive || existingUser.isDeleted) {
      throw new AuthError('Account is inactive');
    }

    // Create the connection
    connection = await prisma.oauthConnection.create({
      data: {
        userId: existingUser.id,
        providerId: provider.id,
        providerUserId: userInfo.sub,
        accessTokenEncrypted: tokenData.access_token,
        refreshTokenEncrypted: tokenData.refresh_token ?? null,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
      },
      include: { user: true },
    });
    isNewConnection = true;
  } else {
    // Update tokens on existing connection
    await prisma.oauthConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: tokenData.access_token,
        refreshTokenEncrypted: tokenData.refresh_token ?? connection.refreshTokenEncrypted,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : connection.expiresAt,
      },
    });
  }

  const user = connection.user!;
  if (!user.isActive || user.isDeleted) {
    throw new AuthError('Account is inactive');
  }

  // If MFA is enabled, we don't issue tokens via OAuth — require MFA step
  if (user.twoFactorEnabled) {
    throw new AuthError(
      'MFA is enabled on this account. Please log in with email/password + MFA code.',
    );
  }

  // Create session and issue tokens
  const refreshExpiresAt = new Date(
    Date.now() + config.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: 'pending',
      ipAddress: ipAddress,
      userAgent: userAgent,
      expiresAt: refreshExpiresAt,
      lastUsedAt: new Date(),
    },
  });

  const tokens = generateTokenPair({
    userId: user.id,
    userType: 'internal',
    sessionId: session.id,
  });

  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: tokens.refreshTokenHash },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      isActive: user.isActive,
      twoFactorEnabled: user.twoFactorEnabled,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: tokens.accessExpiresAt.toISOString(),
    refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
    sessionId: session.id,
    isNewConnection,
  };
}
