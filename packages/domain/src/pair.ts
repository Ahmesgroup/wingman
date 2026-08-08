export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function pairParts(a: string, b: string): { pairLowId: string; pairHighId: string; pairKey: string } {
  const [pairLowId, pairHighId] = a < b ? [a, b] : [b, a];
  return { pairLowId, pairHighId, pairKey: `${pairLowId}:${pairHighId}` };
}
