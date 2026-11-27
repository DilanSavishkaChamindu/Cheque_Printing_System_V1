export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  majorUnitSingular: string;
  majorUnitPlural: string;
  minorUnitSingular: string;
  minorUnitPlural: string;
  decimalPlaces: number;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  LKR: {
    code: 'LKR',
    name: 'Sri Lankan Rupee',
    symbol: 'Rs.',
    majorUnitSingular: 'Rupee',
    majorUnitPlural: 'Rupees',
    minorUnitSingular: 'Cent',
    minorUnitPlural: 'Cents',
    decimalPlaces: 2,
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    majorUnitSingular: 'Dollar',
    majorUnitPlural: 'Dollars',
    minorUnitSingular: 'Cent',
    minorUnitPlural: 'Cents',
    decimalPlaces: 2,
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    majorUnitSingular: 'Euro',
    majorUnitPlural: 'Euros',
    minorUnitSingular: 'Cent',
    minorUnitPlural: 'Cents',
    decimalPlaces: 2,
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    majorUnitSingular: 'Pound',
    majorUnitPlural: 'Pounds',
    minorUnitSingular: 'Pence',
    minorUnitPlural: 'Pence',
    decimalPlaces: 2,
  },
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    majorUnitSingular: 'Rupee',
    majorUnitPlural: 'Rupees',
    minorUnitSingular: 'Paise',
    minorUnitPlural: 'Paise',
    decimalPlaces: 2,
  },
  AED: {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'AED',
    majorUnitSingular: 'Dirham',
    majorUnitPlural: 'Dirhams',
    minorUnitSingular: 'Fils',
    minorUnitPlural: 'Fils',
    decimalPlaces: 2,
  },
  SGD: {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'S$',
    majorUnitSingular: 'Dollar',
    majorUnitPlural: 'Dollars',
    minorUnitSingular: 'Cent',
    minorUnitPlural: 'Cents',
    decimalPlaces: 2,
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    majorUnitSingular: 'Dollar',
    majorUnitPlural: 'Dollars',
    minorUnitSingular: 'Cent',
    minorUnitPlural: 'Cents',
    decimalPlaces: 2,
  },
};

export const DEFAULT_CURRENCY_CODE = 'LKR';
