export function hasChineseText(value: string | null | undefined): boolean {
  return Boolean(value && /\p{Script=Han}/u.test(value));
}
