// RNG com seed (xorshift32) — mesma seed, mesma run. Nenhuma aleatoriedade de gameplay fora daqui.
export class Rng {
  state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let s = this.state;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    this.state = s;
    return s;
  }
  float(): number { return (this.next() >>> 8) / 16777216; }
  range(a: number, b: number): number { return a + (b - a) * this.float(); }
  int(a: number, b: number): number { return a + Math.floor(this.float() * (b - a + 1)); }
  chance(p: number): boolean { return this.float() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.float() * arr.length)]; }
}

export function hash2(a: number, b: number): number {
  let h = (a ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = (h + Math.imul(b + 0x632be5ab, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0 || 1;
}
