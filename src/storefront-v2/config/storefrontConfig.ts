export type StoreChipKind = 'category' | 'discount';

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
  { id: 'descuento', label: 'Descuento', value: 'Descuento', kind: 'discount', icon: '-%', active: true, sort: 40 },
];

function cleanChipLabel(label: string, value: string, kind: StoreChipKind): string {
  if (kind !== 'category') return value === 'Descuento' ? 'Descuento' : label;
  return label.endsWith(` ${value}`) ? value : label;
}

export function parseStoreChips(raw?: string | null): StoreChip[] {
  if (!raw) return DEFAULT_STORE_CHIPS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_STORE_CHIPS;
    const chips = parsed
      .map((item, index) => {
        const rawKind = String(item.kind || '').toLowerCase();
        const rawValue = String(item.value || item.label || 'Blusas').trim();
        const isOldPromo = ['Promo', 'Promos', 'Rebajas'].includes(rawValue);
        const isDiscount = rawKind === 'discount' || rawValue === 'Descuento' || isOldPromo;
        const kind: StoreChipKind = isDiscount ? 'discount' : 'category';
        const value = isDiscount ? 'Descuento' : rawValue;
        const rawLabel = String(item.label || item.value || 'Categoria').trim();
        return {
          id: isDiscount ? 'descuento' : (String(item.id || item.value || item.label || `chip-${index}`).trim() || `chip-${index}`),
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
    if (!chips.some(chip => chip.value === 'Descuento')) {
      chips.push({ id: 'descuento', label: 'Descuento', value: 'Descuento', kind: 'discount', icon: '-%', image: '', active: true, sort: chips.length * 10 });
    }
    return chips.sort((a, b) => a.sort - b.sort);
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
