import { encodeFunctionData, isAddress, parseUnits, zeroAddress } from 'viem';

const nativeTokenSentinel = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const erc20TransferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export type EvmTransferCall = {
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
};

export function isNativeEvmToken(tokenAddress?: string | null) {
  return (
    !tokenAddress ||
    tokenAddress === zeroAddress ||
    tokenAddress.toLowerCase() === nativeTokenSentinel
  );
}

function parseDecimalAmount(amountDecimal: string, decimals: number) {
  if (!/^\d+(\.\d+)?$/.test(amountDecimal.trim())) {
    throw new Error('Enter an amount greater than zero.');
  }

  const amount = parseUnits(amountDecimal, decimals);

  if (amount <= 0n) {
    throw new Error('Enter an amount greater than zero.');
  }

  return amount;
}

export function buildEvmTransferCall(input: {
  recipientAddress: string;
  amountDecimal: string;
  tokenAddress?: string | null;
  decimals?: number;
}): EvmTransferCall {
  const recipient = input.recipientAddress.trim();

  if (!isAddress(recipient)) {
    throw new Error('Enter a valid Base or Ethereum address.');
  }

  if (isNativeEvmToken(input.tokenAddress)) {
    return {
      to: recipient,
      value: parseDecimalAmount(input.amountDecimal, 18),
      data: '0x',
    };
  }

  const tokenAddress = input.tokenAddress?.trim();
  if (!tokenAddress || !isAddress(tokenAddress)) {
    throw new Error('This asset is not ready to send.');
  }

  const tokenDecimals = input.decimals;
  if (typeof tokenDecimals !== 'number' || !Number.isInteger(tokenDecimals) || tokenDecimals < 0) {
    throw new Error('This asset is missing details needed to send.');
  }

  const amount = parseDecimalAmount(input.amountDecimal, tokenDecimals);

  return {
    to: tokenAddress,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: 'transfer',
      args: [recipient, amount],
    }),
  };
}
