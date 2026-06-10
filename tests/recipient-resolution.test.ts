import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractRecipientCandidate,
  getEnsResolutionCopy,
  getEthereumRecipientAddress,
  isLikelyEnsName,
} from '../utils/onchain/recipient';

const lowercaseAddress = '0x52908400098527886e0f7030069857d2e4169ee7';
const checksummedAddress = '0x52908400098527886E0F7030069857D2E4169EE7';

test('recipient candidate extraction handles plain addresses and embedded text', () => {
  assert.equal(extractRecipientCandidate(''), '');
  assert.equal(extractRecipientCandidate('   '), '');
  assert.equal(extractRecipientCandidate(lowercaseAddress), lowercaseAddress);
  assert.equal(extractRecipientCandidate(`  ${lowercaseAddress}  `), lowercaseAddress);
  assert.equal(
    extractRecipientCandidate(`Send it to ${lowercaseAddress} please`),
    lowercaseAddress
  );
});

test('recipient candidate extraction reads payment URIs and query params', () => {
  assert.equal(
    extractRecipientCandidate(`https://pay.example.com/checkout?address=${lowercaseAddress}`),
    lowercaseAddress
  );
  assert.equal(extractRecipientCandidate('https://pay.example.com/checkout?to=vitalik.eth'), 'vitalik.eth');
  assert.equal(extractRecipientCandidate('app://x?recipient=name.eth'), 'name.eth');
  assert.equal(extractRecipientCandidate(`ethereum:${lowercaseAddress}`), lowercaseAddress);
  assert.equal(extractRecipientCandidate(`ethereum:pay-${lowercaseAddress}@8453`), lowercaseAddress);
});

test('recipient candidate extraction pulls ENS names out of surrounding text', () => {
  assert.equal(extractRecipientCandidate('vitalik.eth'), 'vitalik.eth');
  assert.equal(extractRecipientCandidate('pay vitalik.eth today'), 'vitalik.eth');
  assert.equal(extractRecipientCandidate('sub.name.eth'), 'sub.name.eth');
});

test('ethereum recipient addresses are checksummed or rejected', () => {
  assert.equal(getEthereumRecipientAddress(lowercaseAddress), checksummedAddress);
  assert.equal(getEthereumRecipientAddress(checksummedAddress), checksummedAddress);
  assert.equal(getEthereumRecipientAddress('vitalik.eth'), null);
  assert.equal(getEthereumRecipientAddress('0x1234'), null);
  assert.equal(getEthereumRecipientAddress(''), null);
});

test('ENS shape detection requires a dot and a normalizable name', () => {
  assert.equal(isLikelyEnsName('vitalik.eth'), true);
  assert.equal(isLikelyEnsName('sub.name.eth'), true);
  assert.equal(isLikelyEnsName('vitalik'), false);
  assert.equal(isLikelyEnsName(''), false);
  assert.equal(isLikelyEnsName(lowercaseAddress), false);
});

test('ENS resolution copy reflects reverse-record confidence', () => {
  assert.equal(
    getEnsResolutionCopy({
      address: checksummedAddress,
      name: 'vitalik.eth',
      reverseName: 'vitalik.eth',
      reverseMatches: true,
    }),
    'Wallet name confirmed: vitalik.eth'
  );
  assert.equal(
    getEnsResolutionCopy({
      address: checksummedAddress,
      name: 'vitalik.eth',
      reverseName: 'other.eth',
      reverseMatches: false,
    }),
    'Wallet name: other.eth'
  );
  assert.equal(
    getEnsResolutionCopy({
      address: checksummedAddress,
      name: 'vitalik.eth',
      reverseName: null,
      reverseMatches: false,
    }),
    'No wallet name found. Check the address before you send.'
  );
});
