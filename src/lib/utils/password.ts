import { randomBytes } from "crypto";

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS;

const PASSWORD_LENGTH = 12;

export const generateTemporaryPassword = (): string => {
  const bytes = randomBytes(PASSWORD_LENGTH);
  const chars: string[] = [];

  // Ensure at least one of each required type
  chars.push(UPPERCASE[bytes[0]! % UPPERCASE.length]!);
  chars.push(LOWERCASE[bytes[1]! % LOWERCASE.length]!);
  chars.push(DIGITS[bytes[2]! % DIGITS.length]!);

  // Fill remaining positions
  for (let i = 3; i < PASSWORD_LENGTH; i++) {
    chars.push(ALL_CHARS[bytes[i]! % ALL_CHARS.length]!);
  }

  // Shuffle using Fisher-Yates
  const extraBytes = randomBytes(PASSWORD_LENGTH);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = extraBytes[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join("");
};

export const isValidPassword = (password: string): boolean => {
  if (password.length < 8) return false;
  if (!/[a-zA-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
};
