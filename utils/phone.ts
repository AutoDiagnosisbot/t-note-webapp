export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 10 && !digits.startsWith('7') && !digits.startsWith('8')) {
    return `+7${digits}`;
  }

  return input.trim();
}

export function isPhoneComplete(input: string): boolean {
  const normalized = normalizePhone(input);
  return /^\+7\d{10}$/.test(normalized);
}

export function formatPhoneForInput(input: string): string {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits;
  const clipped = local.slice(0, 10);

  const p1 = clipped.slice(0, 3);
  const p2 = clipped.slice(3, 6);
  const p3 = clipped.slice(6, 8);
  const p4 = clipped.slice(8, 10);

  let result = '+7';
  if (p1) result += ` ${p1}`;
  if (p2) result += ` ${p2}`;
  if (p3) result += `-${p3}`;
  if (p4) result += `-${p4}`;

  return result;
}
