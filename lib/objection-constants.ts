export const leadObjectionCategories = [
  'price',
  'timing',
  'trust',
  'schedule',
  'location',
  'accommodation',
  'certification',
  'health',
  'travel',
  'payment',
  'family',
  'work',
  'other',
] as const;

export type LeadObjectionCategory = (typeof leadObjectionCategories)[number];
