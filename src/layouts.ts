/**
 * Saved layouts. There is no server behind this app, so a layout lives in the
 * browser's own storage - which is exactly what we want with two people using
 * it: each of us keeps our own named scenarios, and swapping one means
 * exporting the JSON and importing it (or dropping it into data/layout.json to
 * change the default everybody starts from).
 */

import type { PlacedItem } from './types';

/** Named scenarios the user has deliberately saved. */
const SAVED_KEY = 'welding-shop.layouts';
/** The arrangement as it stands right now, so a refresh doesn't lose work. */
const WORKING_KEY = 'welding-shop.working';
/** Which saved layout that working state came from, if any. */
const WORKING_NAME_KEY = 'welding-shop.working-name';

export type SavedLayouts = Record<string, PlacedItem[]>;

/** Placements are mutated in place once built, so hand out copies. */
export function cloneItems(items: PlacedItem[]): PlacedItem[] {
  return items.map((item) => ({ ...item }));
}

/** Anything that isn't a plausible placement is dropped rather than trusted. */
function parseItems(value: unknown): PlacedItem[] | null {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : null;
  if (!raw) return null;
  const items: PlacedItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { catalogId, x, z, rotation } = entry as Record<string, unknown>;
    if (typeof catalogId !== 'string' || typeof x !== 'number' || typeof z !== 'number') continue;
    items.push({ catalogId, x, z, rotation: typeof rotation === 'number' ? rotation : 0 });
  }
  return items;
}

// Storage throws outright in some private-browsing modes, so every touch is
// guarded and a failure just means layouts don't persist this session.
function read(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable - carry on without persistence */
  }
}

export function readSaved(): SavedLayouts {
  const value = read(SAVED_KEY);
  if (typeof value !== 'object' || value === null) return {};
  const out: SavedLayouts = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    const items = parseItems(entry);
    if (items) out[name] = items;
  }
  return out;
}

export function saveLayout(name: string, items: PlacedItem[]): SavedLayouts {
  const all = readSaved();
  all[name] = cloneItems(items);
  write(SAVED_KEY, all);
  return all;
}

export function deleteLayout(name: string): SavedLayouts {
  const all = readSaved();
  delete all[name];
  write(SAVED_KEY, all);
  return all;
}

export function readWorking(): PlacedItem[] | null {
  return parseItems(read(WORKING_KEY));
}

export function writeWorking(items: PlacedItem[]): void {
  write(WORKING_KEY, cloneItems(items));
}

export function readWorkingName(): string {
  const value = read(WORKING_NAME_KEY);
  return typeof value === 'string' ? value : '';
}

export function writeWorkingName(name: string): void {
  write(WORKING_NAME_KEY, name);
}

/** Same shape as data/layout.json, so an export can become the new default. */
export function toFileJson(name: string, items: PlacedItem[]): string {
  return `${JSON.stringify({ name, items: cloneItems(items) }, null, 2)}\n`;
}

export function parseFileJson(text: string): PlacedItem[] | null {
  try {
    return parseItems(JSON.parse(text));
  } catch {
    return null;
  }
}
