type GuestCheckoutBlockerInput = {
  isGuestCheckout: boolean;
  country: string;
  linkedEmail?: string | null;
  linkedPhone?: string | null;
  hasFreshVerifiedPhone: boolean;
};

export function getGuestCheckoutBlocker(input: GuestCheckoutBlockerInput) {
  if (!input.isGuestCheckout) {
    return null;
  }

  if (input.country !== 'US') {
    return 'region';
  }

  if (!input.linkedEmail || !input.linkedPhone || !input.hasFreshVerifiedPhone) {
    return 'verification';
  }

  return null;
}
