export type OnrampFormData = {
  amount: string;
  asset: string;
  network: string;
  address: string;
  sandbox: boolean;
  paymentMethod: string;
  paymentCurrency: string;
  phoneNumber?: string;
  agreementAcceptedAt?: string;
};

export type PaymentMethodOption = {
  display: string;
  value: string;
};
