/** EAN-13 → 95 modules ("1" = bar). Returns null when the code is not a valid EAN-13. */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13Modules(code: string): string | null {
  if (!/^\d{13}$/.test(code)) return null;
  const d = code.split("").map(Number);
  const sum = d.slice(0, 12).reduce((s, v, i) => s + v * (i % 2 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== d[12]) return null;
  const parity = PARITY[d[0]];
  let out = "101";
  for (let i = 1; i <= 6; i++) out += parity[i - 1] === "L" ? L[d[i]] : G[d[i]];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R[d[i]];
  return out + "101";
}

/** Runs of equal modules: [isBar, width][] — drawn as Views. */
export function runs(modules: string): [boolean, number][] {
  const r: [boolean, number][] = [];
  for (const ch of modules) {
    const bar = ch === "1";
    const last = r[r.length - 1];
    if (last && last[0] === bar) last[1]++;
    else r.push([bar, 1]);
  }
  return r;
}

/** Code 128 bar/space widths for values 0…105, plus the stop pattern (106). */
const C128 = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

/**
 * Code 128 → modules ("1" = bar). Card numbers that aren't EAN-13 (MAXMA cards can be any length):
 * digits of even length use set C (compact), anything else set B. Null for unsupported characters.
 */
export function code128Modules(code: string): string | null {
  if (!code) return null;
  let values: number[];
  if (/^\d+$/.test(code) && code.length % 2 === 0) {
    values = [105];
    for (let i = 0; i < code.length; i += 2) values.push(Number(code.slice(i, i + 2)));
  } else {
    if (!/^[\x20-\x7e]+$/.test(code)) return null;
    values = [104, ...code.split("").map((ch) => ch.charCodeAt(0) - 32)];
  }
  const check = values.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0) % 103;
  values.push(check, 106);
  let out = "";
  for (const v of values) {
    const w = C128[v];
    for (let i = 0; i < w.length; i++) out += (i % 2 === 0 ? "1" : "0").repeat(Number(w[i]));
  }
  return out;
}
