import { scanFromURLAsync } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';

import type { ShowTransferAlert } from '@/hooks/wallet/useTransferAlert';
import { isSolanaNetwork } from '@/utils/onchain/networkDisplay';
import {
  extractRecipientCandidate,
  getEthereumRecipientAddress,
  isLikelyEnsName,
  resolveEnsRecipient,
  type EnsResolution,
} from '@/utils/onchain/recipient';

export type RecipientResolveResult = { ok: boolean; error?: string };

/**
 * Recipient resolution state machine for the send flow.
 *
 * Owns the raw input, the resolved address, ENS resolution state, validation
 * errors, and the paste/QR-photo input paths. Also owns the synchronous
 * in-flight guard so a double-tap on Review cannot re-enter submission while
 * async ENS recipient resolution is still in flight.
 */
export function useRecipientResolution({
  network,
  showAlert,
}: {
  network: string;
  showAlert: ShowTransferAlert;
}) {
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [ensResolution, setEnsResolution] = useState<EnsResolution | null>(null);
  const [resolvingRecipient, setResolvingRecipient] = useState(false);
  const [scanningQrPhoto, setScanningQrPhoto] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  // Synchronous guard so a double-tap on Review cannot re-enter handleSend
  // while async ENS recipient resolution is still in flight.
  const reviewSubmitInFlightRef = useRef(false);

  // Validate address format
  const validateAddress = (address: string) => {
    const candidate = extractRecipientCandidate(address);

    if (!candidate) {
      setAddressError(null);
      return false;
    }

    if (isSolanaNetwork(network)) {
      if (!candidate.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
        setAddressError('Enter a valid Solana address.');
        return false;
      }
    } else {
      const ethereumAddress = getEthereumRecipientAddress(candidate);
      if (!ethereumAddress) {
        setAddressError('Enter a valid Ethereum address or ENS name.');
        return false;
      }
      setRecipientAddress(ethereumAddress);
    }

    setAddressError(null);
    return true;
  };

  // Update address and validate
  const handleAddressChange = (address: string) => {
    setRecipientInput(address);
    setEnsResolution(null);

    const candidate = extractRecipientCandidate(address);
    if (!candidate) {
      setRecipientAddress('');
      setAddressError(null);
      return;
    }

    if (isSolanaNetwork(network)) {
      setRecipientAddress(candidate);
      validateAddress(candidate);
      return;
    }

    const ethereumAddress = getEthereumRecipientAddress(candidate);
    if (ethereumAddress) {
      setRecipientAddress(ethereumAddress);
      setAddressError(null);
    } else if (isLikelyEnsName(candidate)) {
      setRecipientAddress('');
      setAddressError(null);
    } else {
      setRecipientAddress('');
      setAddressError('Enter a valid Ethereum address or ENS name.');
    }
  };

  const resolveRecipientInput = async (): Promise<RecipientResolveResult> => {
    const candidate = extractRecipientCandidate(recipientInput || recipientAddress);

    if (!candidate) {
      return { ok: false, error: 'Add the wallet or ENS name you want to use.' };
    }

    if (isSolanaNetwork(network)) {
      return validateAddress(candidate)
        ? { ok: true }
        : { ok: false, error: 'Enter a valid Solana address.' };
    }

    const ethereumAddress = getEthereumRecipientAddress(candidate);
    if (ethereumAddress) {
      setRecipientAddress(ethereumAddress);
      setAddressError(null);
      return { ok: true };
    }

    if (!isLikelyEnsName(candidate)) {
      const error = 'Enter a valid Ethereum address or ENS name.';
      setAddressError(error);
      return { ok: false, error };
    }

    setResolvingRecipient(true);
    try {
      const resolution = await resolveEnsRecipient(candidate);
      setEnsResolution(resolution);
      setRecipientAddress(resolution.address);
      setRecipientInput(resolution.name);
      setAddressError(null);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'We could not find that ENS name.';
      setEnsResolution(null);
      setRecipientAddress('');
      setAddressError(message);
      return { ok: false, error: message };
    } finally {
      setResolvingRecipient(false);
    }
  };

  const handlePasteRecipient = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      handleAddressChange(extractRecipientCandidate(text));
    }
  };

  const handleQrPhoto = async () => {
    setScanningQrPhoto(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert('Photo access needed', 'Allow photo access to scan a QR code.', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled) {
        return;
      }

      const uri = result.assets?.[0]?.uri;
      if (!uri) {
        throw new Error('Choose a clear photo of the QR code.');
      }

      const scans = await scanFromURLAsync(uri, ['qr']);
      const qrData = scans.find((scan) => scan.data)?.data;
      if (!qrData) {
        showAlert('No QR code found', 'Choose a clear photo of the QR code.', 'error');
        return;
      }

      const candidate = extractRecipientCandidate(qrData);
      handleAddressChange(candidate);
    } catch (error) {
      showAlert(
        'Could not read QR code',
        error instanceof Error ? error.message : 'Choose a clearer photo and try again.',
        'error'
      );
    } finally {
      setScanningQrPhoto(false);
    }
  };

  // Seed the recipient from a navigation param (agent funding, deep links).
  const setRecipientFromParam = useCallback((value: string) => {
    const candidate = extractRecipientCandidate(value);
    const ethereumAddress = getEthereumRecipientAddress(candidate);
    setRecipientInput(ethereumAddress || candidate);
    setRecipientAddress(ethereumAddress || candidate);
  }, []);

  const resetRecipient = useCallback(() => {
    setRecipientInput('');
    setRecipientAddress('');
    setEnsResolution(null);
    setAddressError(null);
  }, []);

  return {
    recipientInput,
    recipientAddress,
    ensResolution,
    resolvingRecipient,
    scanningQrPhoto,
    addressError,
    reviewSubmitInFlightRef,
    handleAddressChange,
    resolveRecipientInput,
    handlePasteRecipient,
    handleQrPhoto,
    setRecipientFromParam,
    resetRecipient,
  };
}
