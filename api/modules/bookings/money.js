export function decimalToCents(value) {
  const text = String(value);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) throw new Error("Invalid decimal amount");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid decimal amount");
  return cents;
}

export function centsToDecimal(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid cents amount");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function percentageOfCents(cents, percent) {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(percent));
  if (!match) throw new Error("Invalid decimal percentage");
  const basisPoints = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  if (basisPoints < 1 || basisPoints > 10000) throw new Error("Invalid decimal percentage");
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid cents amount");
  const rounded = (BigInt(cents) * BigInt(basisPoints) + 5000n) / 10000n;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid cents amount");
  return Number(rounded);
}
