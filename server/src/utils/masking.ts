export function maskAccountNumber(accountNumber: string): string {
  const trimmed = accountNumber.trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }
  const visible = trimmed.slice(-4);
  return `${'*'.repeat(Math.min(8, trimmed.length - 4))}${visible}`;
}
