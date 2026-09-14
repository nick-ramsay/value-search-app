/**
 * Pure helpers for the cascading sector -> industry filter relationship.
 * No external imports (safe to use from both server components and
 * "use client" components without pulling server-only code into the
 * client bundle).
 */

/**
 * Drops any industry that doesn't belong to at least one of the given
 * sectors. When sectors is empty, every industry remains unconstrained.
 */
export function pruneIndustriesForSectors(
  industries: string[],
  sectors: string[],
  sectorIndustryMap: Record<string, string[]>,
): string[] {
  if (sectors.length === 0) {
    return industries;
  }
  const allowed = new Set<string>();
  for (const sector of sectors) {
    for (const industry of sectorIndustryMap[sector] ?? []) {
      allowed.add(industry);
    }
  }
  return industries.filter((industry) => allowed.has(industry));
}

/** The full industry list, narrowed to only those valid for the given sectors. */
export function availableIndustriesForSectors(
  allIndustries: string[],
  sectors: string[],
  sectorIndustryMap: Record<string, string[]>,
): string[] {
  if (sectors.length === 0) {
    return allIndustries;
  }
  const allowed = new Set<string>();
  for (const sector of sectors) {
    for (const industry of sectorIndustryMap[sector] ?? []) {
      allowed.add(industry);
    }
  }
  return allIndustries.filter((industry) => allowed.has(industry));
}

export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}
