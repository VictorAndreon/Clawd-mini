import type { Box } from './theme';

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Menor retângulo (em px da janela quadrada de lado `size`) que cobre todos os `boxes`,
// que vêm em unidades do viewBox. Sem nenhum box conhecido, devolve null (janela inteira).
export function hitRect(viewBox: Box, boxes: Box[], size: number): PixelRect | null {
  if (boxes.length === 0) return null;
  const [vx0, vy0, vx1, vy1] = viewBox;
  const sx = size / (vx1 - vx0);
  const sy = size / (vy1 - vy0);
  const clamp = (v: number): number => Math.min(size, Math.max(0, v));
  const x0 = clamp(Math.floor((Math.min(...boxes.map((b) => b[0])) - vx0) * sx));
  const y0 = clamp(Math.floor((Math.min(...boxes.map((b) => b[1])) - vy0) * sy));
  const x1 = clamp(Math.ceil((Math.max(...boxes.map((b) => b[2])) - vx0) * sx));
  const y1 = clamp(Math.ceil((Math.max(...boxes.map((b) => b[3])) - vy0) * sy));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
