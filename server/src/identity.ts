import { createPrivateKey, createPublicKey, randomUUID } from 'node:crypto';

import { verifyAccessToken } from '@privy-io/node';
import { SignJWT } from 'jose';

const privyAppId = process.env.PRIVY_APP_ID;
const privyVerificationKey = process.env.PRIVY_VERIFICATION_KEY;
const cdpIssuer = process.env.REGENTS_CDP_JWT_ISSUER;
const cdpAudience = process.env.REGENTS_CDP_JWT_AUDIENCE;
const cdpPrivateKeyPem = process.env.REGENTS_CDP_JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const cdpKeyId = process.env.REGENTS_CDP_JWT_KID || 'regents-mobile';
const cdpJwtAlgorithm = (process.env.REGENTS_CDP_JWT_ALG || 'ES256') as 'ES256' | 'RS256';

const privateKey = cdpPrivateKeyPem ? createPrivateKey(cdpPrivateKeyPem) : null;
const publicKey = privateKey ? createPublicKey(privateKey) : null;
const publicJwk = publicKey ? publicKey.export({ format: 'jwk' }) : null;

function requirePrivyConfig() {
  if (!privyAppId || !privyVerificationKey) {
    throw new Error('Missing Privy server configuration.');
  }
}

function requireCdpJwtConfig() {
  if (!cdpIssuer || !cdpAudience || !privateKey || !publicJwk) {
    throw new Error('Missing Coinbase custom sign-in configuration.');
  }
}

export async function verifyPrivyAccessToken(accessToken: string) {
  requirePrivyConfig();

  return verifyAccessToken({
    access_token: accessToken,
    app_id: privyAppId!,
    verification_key: privyVerificationKey!,
  });
}

export async function createCdpCustomAuthToken(userId: string) {
  requireCdpJwtConfig();

  return new SignJWT({
    user_id: userId,
  })
    .setProtectedHeader({
      alg: cdpJwtAlgorithm,
      kid: cdpKeyId,
      typ: 'JWT',
    })
    .setIssuer(cdpIssuer!)
    .setAudience(cdpAudience!)
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey!);
}

export function getCdpJwks() {
  requireCdpJwtConfig();

  return {
    keys: [
      {
        ...publicJwk,
        alg: cdpJwtAlgorithm,
        kid: cdpKeyId,
        use: 'sig',
      },
    ],
  };
}
