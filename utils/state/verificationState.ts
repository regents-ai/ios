import AsyncStorage from '@react-native-async-storage/async-storage';

import { PHONE_COUNTRIES } from '@/constants/PhoneCountries';

const PHONE_KEY = 'verifiedPhone';
const PHONE_AT_KEY = 'verifiedPhoneAt';
const PHONE_USER_KEY = 'verifiedPhoneUserId';
const LIFETIME_TX_THRESHOLD_KEY = 'lifetimeTransactionThreshold';
const DEFAULT_LIFETIME_TX_THRESHOLD = 5;

export const PHONE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

let verifiedPhone: string | null = null;
let verifiedPhoneAt: number | null = null;
let verifiedPhoneUserId: string | null = null;
let lifetimeTransactionThreshold = DEFAULT_LIFETIME_TX_THRESHOLD;

export async function setVerifiedPhone(phone: string | null, userId?: string) {
  verifiedPhone = phone;
  verifiedPhoneAt = phone ? Date.now() : null;
  verifiedPhoneUserId = userId || null;

  if (phone) {
    await AsyncStorage.multiSet([
      [PHONE_KEY, phone],
      [PHONE_AT_KEY, String(verifiedPhoneAt)],
      [PHONE_USER_KEY, userId || ''],
    ]);
    return;
  }

  verifiedPhoneUserId = null;
  await AsyncStorage.multiRemove([PHONE_KEY, PHONE_AT_KEY, PHONE_USER_KEY]);
}

export async function hydrateVerifiedPhone() {
  const [phone, timestamp, userId] = await AsyncStorage.multiGet([PHONE_KEY, PHONE_AT_KEY, PHONE_USER_KEY]);
  verifiedPhone = phone?.[1] || null;
  verifiedPhoneAt = timestamp?.[1] ? Number(timestamp[1]) : null;
  verifiedPhoneUserId = userId?.[1] || null;
}

export function getVerifiedPhone() {
  return verifiedPhone;
}

export function getVerifiedPhoneAt() {
  return verifiedPhoneAt;
}

export function getVerifiedPhoneUserId() {
  return verifiedPhoneUserId;
}

export function isPhoneFresh60d() {
  if (!verifiedPhoneAt) {
    return false;
  }

  return Date.now() - verifiedPhoneAt < PHONE_TTL_MS;
}

export function phoneExpiry() {
  return verifiedPhoneAt ? new Date(verifiedPhoneAt + PHONE_TTL_MS) : null;
}

export async function forceUnverifyPhone() {
  verifiedPhone = null;
  verifiedPhoneAt = null;
  verifiedPhoneUserId = null;
  await AsyncStorage.multiRemove([PHONE_KEY, PHONE_AT_KEY, PHONE_USER_KEY]);
}

export function daysUntilExpiry() {
  if (!verifiedPhoneAt) {
    return -1;
  }

  const remaining = verifiedPhoneAt + PHONE_TTL_MS - Date.now();
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

export async function setLifetimeTransactionThreshold(threshold: number) {
  lifetimeTransactionThreshold = threshold;
  await AsyncStorage.setItem(LIFETIME_TX_THRESHOLD_KEY, String(threshold));
}

export function getLifetimeTransactionThreshold() {
  return lifetimeTransactionThreshold;
}

export async function hydrateLifetimeTransactionThreshold() {
  try {
    const stored = await AsyncStorage.getItem(LIFETIME_TX_THRESHOLD_KEY);
    if (!stored) {
      lifetimeTransactionThreshold = DEFAULT_LIFETIME_TX_THRESHOLD;
      return;
    }

    const parsed = parseInt(stored, 10);
    lifetimeTransactionThreshold = !Number.isNaN(parsed) && parsed >= 0 ? parsed : DEFAULT_LIFETIME_TX_THRESHOLD;
  } catch (error) {
    console.error('❌ Error hydrating lifetime transaction threshold:', error);
    lifetimeTransactionThreshold = DEFAULT_LIFETIME_TX_THRESHOLD;
  }
}

export function formatPhoneDisplay(phone: string | null): string {
  if (!phone) {
    return '';
  }

  if (!phone.startsWith('+')) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
    return phone;
  }

  const sortedCountries = [...PHONE_COUNTRIES].sort((left, right) => right.code.length - left.code.length);
  const country = sortedCountries.find((item) => phone.startsWith(item.code));

  if (!country) {
    return phone;
  }

  const localNumber = phone.slice(country.code.length).replace(/\D/g, '');
  if (country.code === '+1' && localNumber.length === 10) {
    return `${country.flag} ${country.code} (${localNumber.slice(0, 3)}) ${localNumber.slice(3, 6)}-${localNumber.slice(6, 10)}`;
  }

  if (country.code === '+65' && localNumber.length === 8) {
    return `${country.flag} ${country.code} ${localNumber.slice(0, 4)} ${localNumber.slice(4, 8)}`;
  }

  if (country.code === '+44' && localNumber.length === 10) {
    return `${country.flag} ${country.code} ${localNumber.slice(0, 4)} ${localNumber.slice(4)}`;
  }

  if (country.code === '+61' && localNumber.length === 9) {
    return `${country.flag} ${country.code} ${localNumber.slice(0, 3)} ${localNumber.slice(3, 6)} ${localNumber.slice(6)}`;
  }

  const groups: string[] = [];
  if (localNumber.length <= 4) {
    groups.push(localNumber);
  } else if (localNumber.length <= 7) {
    groups.push(localNumber.slice(0, 3), localNumber.slice(3));
  } else if (localNumber.length <= 10) {
    const first = Math.floor(localNumber.length / 3);
    const second = Math.floor((localNumber.length - first) / 2);
    groups.push(
      localNumber.slice(0, first),
      localNumber.slice(first, first + second),
      localNumber.slice(first + second)
    );
  } else {
    for (let index = 0; index < localNumber.length; index += 4) {
      groups.push(localNumber.slice(index, index + 4));
    }
  }

  return `${country.flag} ${country.code} ${groups.join(' ')}`;
}
