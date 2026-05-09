import fallbackCodes from "./iso4217-currency-codes-fallback.json";

const fallback = fallbackCodes as string[];

export function getIso4217CurrencyCodes(): readonly string[] {
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return Intl.supportedValuesOf("currency");
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function currencyDisplayNameEn(code: string): string {
  const c = code.trim().toUpperCase();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "currency" });
    return dn.of(c) ?? c;
  } catch {
    return c;
  }
}

/** e.g. `US Dollar (USD)` */
export function formatCurrencyOptionLabel(code: string): string {
  const c = code.trim().toUpperCase();
  return `${currencyDisplayNameEn(c)} (${c})`;
}

export function isValidCurrencyCode(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return false;
  const codes = getIso4217CurrencyCodes();
  return (codes as readonly string[]).includes(c);
}

export type CurrencyOption = { code: string; label: string };

let cachedSortedOptions: CurrencyOption[] | null = null;

export function getCurrencyOptionsSorted(): CurrencyOption[] {
  if (cachedSortedOptions) return cachedSortedOptions;
  const uniq = [...new Set([...getIso4217CurrencyCodes()])];
  cachedSortedOptions = uniq
    .map((code) => ({
      code,
      label: formatCurrencyOptionLabel(code),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  return cachedSortedOptions;
}

export function formatMoneyAmount(
  amount: number,
  currencyCode: string,
): string {
  const c = currencyCode.trim().toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${c}`;
  }
}
