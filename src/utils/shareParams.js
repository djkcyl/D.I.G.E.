import { FUEL_OPTIONS, SECONDARY_FUEL_OPTIONS, INPUT_SOURCE_OPTIONS, DEFAULT_INPUT_SOURCE_ID, PARAM_LIMITS } from './constants';

const SHARE_PARAM_KEY = 'p';
const BASE52_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE52_LOOKUP = new Map(BASE52_ALPHABET.split('').map((char, idx) => [char, idx]));

const PRIMARY_FUEL_BITS = 5;
const SECONDARY_FUEL_BITS = 5;
const MAX_WASTE_BITS = 12;
const MIN_BATTERY_BITS = 7;
const TARGET_POWER_BITS = 15;
const INPUT_SOURCE_BITS = 2;
const MAX_BRANCHES_BITS = 3;
const EXCLUDE_BELT_BITS = 2;

const toBase52 = (value) => {
  let num = BigInt(value);
  if (num < 0n) return null;
  if (num === 0n) return BASE52_ALPHABET[0];
  let out = '';
  while (num > 0n) {
    const idx = Number(num % 52n);
    out = BASE52_ALPHABET[idx] + out;
    num /= 52n;
  }
  return out;
};

const fromBase52 = (value) => {
  if (!value || typeof value !== 'string') return null;
  let num = 0n;
  for (let i = 0; i < value.length; i++) {
    const idx = BASE52_LOOKUP.get(value[i]);
    if (idx === undefined) return null;
    num = num * 52n + BigInt(idx);
  }
  return num;
};

const isValidNonNegativeInt = (value) => Number.isInteger(value) && value >= 0;

const defaultInputIndex = INPUT_SOURCE_OPTIONS.findIndex((source) => source.id === DEFAULT_INPUT_SOURCE_ID);

const maxValueFromBits = (bits) => (1 << bits) - 1;
const bitMaskFromBits = (bits) => (1n << BigInt(bits)) - 1n;

const encodeOptionIndex = (options, id, fallbackIndex = -1) => {
  const resolvedId = typeof id === 'string' && id ? id : null;
  const index = options.findIndex((item) => item.id === resolvedId);
  if (index >= 0) return index;
  return fallbackIndex;
};

const decodeOptionId = (options, index) => {
  if (!isValidNonNegativeInt(index)) return null;
  if (index >= options.length) return null;
  const id = options[index]?.id;
  return typeof id === 'string' && id ? id : null;
};

const assertOptionsFitBits = (name, options, bits) => {
  if (options.length - 1 > maxValueFromBits(bits)) {
    throw new Error(`Share field "${name}" exceeds bit capacity`);
  }
};

const createNumberField = ({ index, key, bits, min = 0, max, optional = false, missingRawValue = 0 }) => {
  const maxEncodedValue = maxValueFromBits(bits);
  return {
    index,
    key,
    bits,
    mask: bitMaskFromBits(bits),
    maxEncodedValue,
    optional,
    missingRawValue,
    encode: (value) => {
      const rounded = Math.round(value);
      if (!isValidNonNegativeInt(rounded)) return null;
      if (rounded < min || rounded > max) return null;
      if (rounded > maxEncodedValue) return null;
      return rounded;
    },
    decode: (value) => {
      if (!isValidNonNegativeInt(value)) return null;
      if (value < min || value > max) return null;
      return value;
    },
  };
};

const createOptionField = ({ index, key, bits, options, fallbackIndex = -1, optional = false, missingRawValue = 0 }) => {
  assertOptionsFitBits(key, options, bits);
  const maxEncodedValue = maxValueFromBits(bits);
  return {
    index,
    key,
    bits,
    mask: bitMaskFromBits(bits),
    maxEncodedValue,
    optional,
    missingRawValue,
    encode: (value) => {
      const encoded = encodeOptionIndex(options, value, fallbackIndex);
      if (!isValidNonNegativeInt(encoded) || encoded > maxEncodedValue) return null;
      return encoded;
    },
    decode: (value) => decodeOptionId(options, value),
  };
};

const createBooleanField = ({ index, key, bits = 2, optional = false, missingRawValue = 0 }) => {
  const maxEncodedValue = maxValueFromBits(bits);
  return {
    index,
    key,
    bits,
    mask: bitMaskFromBits(bits),
    maxEncodedValue,
    optional,
    missingRawValue,
    encode: (value) => {
      if (value === true) return 1;
      if (value === false) return 2;
      if (optional && (value === undefined || value === null)) return missingRawValue;
      return null;
    },
    decode: (value) => {
      if (optional && value === missingRawValue) return null;
      if (value === 1) return true;
      if (value === 2) return false;
      return null;
    },
  };
};

const SHARE_FIELDS = [
  createOptionField({ index: 0, key: 'primaryFuelId', bits: PRIMARY_FUEL_BITS, options: FUEL_OPTIONS }),
  createOptionField({ index: 1, key: 'secondaryFuelId', bits: SECONDARY_FUEL_BITS, options: SECONDARY_FUEL_OPTIONS }),
  createNumberField({ index: 2, key: 'maxWaste', bits: MAX_WASTE_BITS, max: PARAM_LIMITS.MAX_MAX_WASTE }),
  createNumberField({ index: 3, key: 'minBatteryPercent', bits: MIN_BATTERY_BITS, max: PARAM_LIMITS.MAX_BATTERY_PERCENT }),
  createNumberField({ index: 4, key: 'targetPower', bits: TARGET_POWER_BITS, max: PARAM_LIMITS.MAX_TARGET_POWER }),
  createOptionField({
    index: 5,
    key: 'inputSourceId',
    bits: INPUT_SOURCE_BITS,
    options: INPUT_SOURCE_OPTIONS,
    fallbackIndex: defaultInputIndex,
  }),
  createNumberField({
    index: 6,
    key: 'maxBranches',
    bits: MAX_BRANCHES_BITS,
    min: PARAM_LIMITS.MIN_BRANCHES,
    max: PARAM_LIMITS.MAX_BRANCHES,
    optional: true,
    missingRawValue: 0,
  }),
  createBooleanField({
    index: 7,
    key: 'exclude_belt',
    bits: EXCLUDE_BELT_BITS,
    optional: true,
    missingRawValue: 0,
  }),
];

const LAYOUT_FIELDS = [...SHARE_FIELDS].sort((a, b) => a.index - b.index);

export function encodeShareParams(params) {
  if (!params) return null;

  let packed = 0n;
  let offset = 0n;

  for (const field of LAYOUT_FIELDS) {
    const encodedValue = field.encode(params[field.key]);
    if (!isValidNonNegativeInt(encodedValue)) return null;
    if (encodedValue > field.maxEncodedValue) return null;

    packed |= BigInt(encodedValue) << offset;
    offset += BigInt(field.bits);
  }

  return toBase52(packed);
}

export function decodeShareParams(value) {
  if (!value || typeof value !== 'string') return null;
  let cursor = fromBase52(value);
  if (cursor === null) return null;

  const decoded = {};

  for (const field of LAYOUT_FIELDS) {
    const rawValue = Number(cursor & field.mask);
    cursor >>= BigInt(field.bits);

    const decodedValue = field.decode(rawValue);
    if (decodedValue === null || decodedValue === undefined) {
      if (field.optional && rawValue === field.missingRawValue) continue;
      return null;
    }

    decoded[field.key] = decodedValue;
  }

  return decoded;
}

export function getShareParamsFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get(SHARE_PARAM_KEY);
  return decodeShareParams(token);
}

export function buildShareUrl(params) {
  if (typeof window === 'undefined') return null;
  const token = encodeShareParams(params);
  if (!token) return null;
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM_KEY, token);
  return url.toString();
}

export { SHARE_PARAM_KEY };
