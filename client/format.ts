export function formatDate(
  value: string | null,
  withTime = false,
  timeZone?: string,
) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}
