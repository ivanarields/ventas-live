export type StoreChipKind = 'category' | 'promo';

export interface StoreChip {
  id: string;
  label: string;
  value: string;
  kind: StoreChipKind;
  icon?: string;
  image?: string;
  active: boolean;
  sort: number;
}

export const DEFAULT_STORE_CHIPS: StoreChip[] = [
  { id: 'blusas', label: 'Blusas', value: 'Blusas', kind: 'category', icon: 'Blusa', active: true, sort: 10 },
  { id: 'vestidos', label: 'Vestidos', value: 'Vestidos', kind: 'category', icon: 'Vestido', active: true, sort: 20 },
  { id: 'chaquetas', label: 'Chaquetas', value: 'Chaquetas', kind: 'category', icon: 'Chaq.', active: true, sort: 30 },
  { id: 'conjuntos', label: 'Conjuntos', value: 'Conjuntos', kind: 'category', icon: 'Set', active: true, sort: 40 },
  { id: 'pantalones', label: 'Pantalones', value: 'Pantalones', kind: 'category', icon: 'Pant.', active: true, sort: 50 },
  { id: 'general', label: 'General', value: 'General', kind: 'category', icon: 'Gen.', active: true, sort: 60 },
  { id: 'rebajas', label: 'Rebajas', value: 'Rebajas', kind: 'promo', icon: '-%', active: true, sort: 100 },
  { id: 'promos', label: 'Promos', value: 'Promos', kind: 'promo', icon: 'Promo', active: true, sort: 110 },
  { id: 'nuevo', label: 'Nuevo', value: 'Nuevo', kind: 'promo', icon: 'New', active: true, sort: 120 },
];

function cleanChipLabel(label: string, value: string, kind: StoreChipKind): string {
  if (kind !== 'category') return label;
  return label.endsWith(` ${value}`) ? value : label;
}

export function parseStoreChips(raw?: string | null): StoreChip[] {
  if (!raw) return DEFAULT_STORE_CHIPS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_STORE_CHIPS;
    return parsed
      .map((item, index) => {
        const kind: StoreChipKind = item.kind === 'promo' ? 'promo' : 'category';
        const value = String(item.value || item.label || 'General').trim();
        const rawLabel = String(item.label || item.value || 'Categoria').trim();
        return {
          id: String(item.id || item.value || item.label || `chip-${index}`).trim() || `chip-${index}`,
          label: cleanChipLabel(rawLabel, value, kind),
          value,
          kind,
          icon: item.icon ? String(item.icon) : '',
          image: item.image ? String(item.image) : '',
          active: item.active !== false,
          sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : index * 10,
        };
      })
      .filter(item => item.label && item.value)
      .filter(item => item.id !== 'all' && item.value !== 'Todos')
      .sort((a, b) => a.sort - b.sort);
  } catch {
    return DEFAULT_STORE_CHIPS;
  }
}

export function serializeStoreChips(chips: StoreChip[]): string {
  return JSON.stringify(chips.map((chip, index) => ({
    ...chip,
    sort: Number.isFinite(Number(chip.sort)) ? Number(chip.sort) : index * 10,
  })));
}
