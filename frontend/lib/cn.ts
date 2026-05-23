import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Idiomatic shadcn helper: `clsx` for conditional class strings + `tailwind-merge`
 * to deduplicate conflicting Tailwind classes. Use this instead of raw template
 * strings so authoring components stays terse and merging is correct.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
