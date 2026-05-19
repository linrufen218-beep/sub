import { Converter } from 'opencc-js';

let cachedConverter: ((text: string) => string) | null = null;

export function toTraditional(text: string): string {
  if (!cachedConverter) {
    cachedConverter = Converter({ from: 'cn', to: 'tw' });
  }
  return cachedConverter(text);
}