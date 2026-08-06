export type SectionVisibility = {
  dinero: boolean;
  tienda: boolean;
};

export const DEFAULT_SECTION_VISIBILITY: SectionVisibility = {
  dinero: true,
  tienda: true,
};

const STORAGE_PREFIX = 'ventas-live:section-visibility:';

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function loadSectionVisibility(userId: string): SectionVisibility {
  if (!userId || typeof window === 'undefined') return DEFAULT_SECTION_VISIBILITY;

  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_SECTION_VISIBILITY;
    const parsed = JSON.parse(raw) as Partial<SectionVisibility>;
    return {
      dinero: parsed.dinero === true,
      tienda: parsed.tienda === true,
    };
  } catch {
    return DEFAULT_SECTION_VISIBILITY;
  }
}

export function saveSectionVisibility(userId: string, value: SectionVisibility) {
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(value));
}
