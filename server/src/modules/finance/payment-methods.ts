// Formas de pagamento da comanda. As de cartão descontam a taxa da
// maquininha configurada em TenantSettings (centésimos de %: 199 = 1,99%).
export const PAYMENT_METHOD_LABELS = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  TRANSFERENCIA: 'Transferência',
  DEBITO: 'Cartão débito',
  CREDITO: 'Cartão crédito',
  PARCELADO: 'Crédito parcelado',
  VALE: 'Vale-presente',
  CORTESIA: 'Cortesia',
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHOD_LABELS;
export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export interface CardFees {
  cardFeeDebitBps: number;
  cardFeeCreditBps: number;
  cardFeeInstallmentBps: number;
}

export function feeBpsFor(method: PaymentMethod, fees: CardFees) {
  if (method === 'DEBITO') return fees.cardFeeDebitBps;
  if (method === 'CREDITO') return fees.cardFeeCreditBps;
  if (method === 'PARCELADO') return fees.cardFeeInstallmentBps;
  return 0;
}

export function feeCents(amountCents: number, method: PaymentMethod, fees: CardFees) {
  return Math.round((amountCents * feeBpsFor(method, fees)) / 10_000);
}
