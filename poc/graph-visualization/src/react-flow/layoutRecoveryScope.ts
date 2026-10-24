export function layoutRecoveryScope(
  userId: number,
): string | null {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }

  return `myway:user:${userId}`;
}
