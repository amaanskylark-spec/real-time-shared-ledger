import QRCode from 'qrcode';
import { generateSecret, generateURI, verify } from 'otplib';

const DELETE_SECURITY_ISSUER = 'Money Tracker';
const OTP_DIGITS = 6;
const OTP_STEP_SECONDS = 30;
const OTP_EPOCH_TOLERANCE_SECONDS = 30;

export const generateDeleteOtpSecret = () => generateSecret();

export const buildDeleteOtpUri = (accountLabel: string, secret: string) => {
  return generateURI({
    issuer: DELETE_SECURITY_ISSUER,
    label: accountLabel,
    secret,
    digits: OTP_DIGITS,
    period: OTP_STEP_SECONDS,
  });
};

export const createDeleteOtpQrCode = async (uri: string) => {
  return QRCode.toDataURL(uri, {
    margin: 1,
    width: 320,
  });
};

export const normalizeOtpToken = (value: string) => value.replace(/\D/g, '').slice(0, OTP_DIGITS);

export const verifyDeleteOtpToken = async (token: string, secret: string) => {
  const normalizedToken = normalizeOtpToken(token);

  if (normalizedToken.length !== OTP_DIGITS || !secret) {
    return false;
  }

  const result = await verify({
    token: normalizedToken,
    secret,
    digits: OTP_DIGITS,
    epochTolerance: OTP_EPOCH_TOLERANCE_SECONDS,
  });

  return result.valid;
};

export const formatSecretForDisplay = (secret: string) => {
  return secret.replace(/(.{4})/g, '$1 ').trim();
};

export const getDeleteOtpAccountLabel = (email?: string | null, uid?: string | null) => {
  return email?.trim().toLowerCase() || uid || 'money-tracker-user';
};

export const getDeleteOtpWindowSeconds = () => OTP_STEP_SECONDS;
