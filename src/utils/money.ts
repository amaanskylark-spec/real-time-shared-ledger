export type TransactionKind = 'given' | 'received';
export type BalanceTone = 'pending' | 'recovering' | 'settled';

export const TRANSACTION_TYPE_LABELS: Record<TransactionKind, string> = {
  given: 'Money Given',
  received: 'Money Received',
};

const hasDecimals = (value: number) => Math.abs(value % 1) > 0.000001;

export const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const formatCurrencyValue = (value: number) => {
  const amount = Number.isFinite(value) ? roundMoney(value) : 0;

  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals(amount) ? 2 : 0,
    maximumFractionDigits: 2,
  });
};

export const formatCurrency = (value: number) => `₹${formatCurrencyValue(value)}`;

export const formatSignedCurrency = (value: number) => {
  const amount = roundMoney(Number(value) || 0);
  if (Math.abs(amount) < 0.0001) return formatCurrency(0);
  return `${amount < 0 ? '-' : ''}${formatCurrency(Math.abs(amount))}`;
};

export const sanitizeAmountInput = (value: string) => {
  const sanitized = value.replace(/[^\d.]/g, '');
  const parts = sanitized.split('.');

  if (parts.length <= 1) return sanitized;

  const integerPart = parts.shift() || '';
  const decimalPart = parts.join('').slice(0, 2);
  return `${integerPart}.${decimalPart}`;
};

export const formatAmountInput = (value: string) => {
  const sanitized = sanitizeAmountInput(value);
  if (!sanitized) return '';

  const [integerPart = '', decimalPart] = sanitized.split('.');
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = Number(normalizedInteger).toLocaleString('en-IN');

  if (sanitized.endsWith('.') && decimalPart === undefined) {
    return `${formattedInteger}.`;
  }

  return decimalPart !== undefined ? `${formattedInteger}.${decimalPart}` : formattedInteger;
};

export const parseAmountInput = (value: string) => {
  const sanitized = sanitizeAmountInput(value);
  if (!sanitized) return 0;

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
};

export const getBalanceDelta = (type: TransactionKind, amount: number) => {
  const safeAmount = roundMoney(Number(amount) || 0);
  return type === 'given' ? safeAmount : -safeAmount;
};

export const calculateBalanceFromTransactions = (
  initialBalance: number,
  transactions: Array<{ amount: number; type: TransactionKind }>
) => {
  const totalDelta = transactions.reduce((sum, transaction) => {
    return roundMoney(sum + getBalanceDelta(transaction.type, Number(transaction.amount) || 0));
  }, 0);

  return roundMoney((Number(initialBalance) || 0) + totalDelta);
};

export const calculateTransactionTotals = (transactions: Array<{ amount: number; type: TransactionKind }>) => {
  return transactions.reduce(
    (totals, transaction) => {
      const amount = roundMoney(Number(transaction.amount) || 0);

      if (transaction.type === 'given') {
        totals.totalGiven = roundMoney(totals.totalGiven + amount);
      } else {
        totals.totalReceived = roundMoney(totals.totalReceived + amount);
      }

      return totals;
    },
    { totalGiven: 0, totalReceived: 0 }
  );
};

export const isSettledBalance = (value: number) => Math.abs(Number(value) || 0) < 0.0001;

export const getBalanceTone = (
  value: number,
  lastTransactionType?: TransactionKind
): BalanceTone => {
  if (isSettledBalance(value)) return 'settled';
  if (lastTransactionType === 'received' || Number(value) < 0) return 'recovering';
  return 'pending';
};

export const getBalanceToneMeta = (
  value: number,
  lastTransactionType?: TransactionKind
) => {
  const tone = getBalanceTone(value, lastTransactionType);

  if (tone === 'settled') {
    return {
      tone,
      badgeLabel: 'Settled',
      cardBg: 'bg-green-50',
      cardBorder: 'border-green-200',
      cardText: 'text-green-700',
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
      heroBg: 'bg-gradient-to-br from-green-500 to-emerald-600',
      heroLabel: 'Account Settled',
      helperLabel: 'Settled',
    };
  }

  if (tone === 'recovering') {
    return {
      tone,
      badgeLabel: Number(value) < 0 ? 'Advance' : 'Receiving',
      cardBg: 'bg-green-50',
      cardBorder: 'border-green-200',
      cardText: 'text-green-700',
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
      heroBg: 'bg-gradient-to-br from-green-500 to-emerald-600',
      heroLabel: Number(value) < 0 ? 'Advance Balance' : 'Balance Improving',
      helperLabel: Number(value) < 0 ? 'Advance' : 'Receiving',
    };
  }

  return {
    tone,
    badgeLabel: 'Pending',
    cardBg: 'bg-red-50',
    cardBorder: 'border-red-200',
    cardText: 'text-red-700',
    iconBg: 'bg-red-100',
    iconText: 'text-red-600',
    heroBg: 'bg-gradient-to-br from-red-500 to-rose-600',
    heroLabel: 'Pending Balance',
    helperLabel: 'Pending',
  };
};

export const getTransactionTypeAvailability = (currentBalance: number) => {
  const balance = roundMoney(Number(currentBalance) || 0);

  if (isSettledBalance(balance)) {
    return {
      canGiven: true,
      canReceived: false,
      preferredType: 'given' as TransactionKind,
      helperMessage: 'Pehle udhaar dein, tabhi wapsi receive hogi!',
    };
  }

  if (balance < 0) {
    return {
      canGiven: true,
      canReceived: false,
      preferredType: 'given' as TransactionKind,
      helperMessage: 'Balance negative hai. Aapne due amount se zyada receive kar liya hai, isliye abhi Money Given se hi adjust hoga.',
    };
  }

  return {
    canGiven: true,
    canReceived: true,
    preferredType: 'given' as TransactionKind,
    helperMessage: '',
  };
};
