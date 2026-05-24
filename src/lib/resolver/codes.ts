const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function getProblemCodeFromIndex(index: number): string {
  const result: string[] = [];
  index += 1;
  while (index > 0) {
    // (index - 1) % 26 is always in [0,25] so the lookup is in-bounds.
    result.push(ALPHABET[(index - 1) % 26]!);
    index = Math.floor((index - 1) / 26);
  }
  return result.reverse().join('');
}
