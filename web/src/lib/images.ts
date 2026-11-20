/** Remote product photos. Every <SmartImage> falls back to a coloured emoji tile if one fails to load. */
export const photo = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const PHOTOS = {
  tomato: 'photo-1592924357228-91a4daadcfea',
  carrot: 'photo-1598170845058-32b9d6a5da37',
  spinach: 'photo-1576045057995-568f588f82fb',
  banana: 'photo-1571771894821-ce9b6c11b08e',
  onion: 'photo-1618512496248-a07fe83aa8cb',
  orange: 'photo-1547514701-42782101795e',
  pepper: 'photo-1563565375-f3fdfdbefa83',
  mango: 'photo-1553279768-865429fa0078',
  avocado: 'photo-1523049673857-eb18f1d7b578',
  pineapple: 'photo-1550258987-190a2d41a8ba',
  potato: 'photo-1518977676601-b53f82aba655',
  cabbage: 'photo-1594282486552-05b4d80fbb9f',
  cucumber: 'photo-1604977042946-1eecc30f269e',
  watermelon: 'photo-1587049352846-4a222e784d38',
  maize: 'photo-1551754655-cd27e38d2076',
  strawberry: 'photo-1464965911861-746a04b4bca6',
  kale: 'photo-1524179091875-bf99a9a6af57',
  garlic: 'photo-1540148426945-6cf22a6b2383',
  box: 'photo-1542838132-92c53300491e',
  farm: 'photo-1500382017468-9049fed747ef',
} as const;

export type PhotoKey = keyof typeof PHOTOS;
export const photoUrl = (k: PhotoKey, w = 800) => photo(PHOTOS[k], w);

const PRODUCT_PHOTOS: readonly [RegExp, PhotoKey][] = [
  [/\btomato(?:es)?\b/i, 'tomato'],
  [/\bcarrot(?:s)?\b/i, 'carrot'],
  [/\bspinach\b/i, 'spinach'],
  [/\bbanana(?:s)?\b/i, 'banana'],
  [/\bonion(?:s)?\b/i, 'onion'],
  [/\borange(?:s)?\b/i, 'orange'],
  [/\bpepper(?:s)?\b/i, 'pepper'],
  [/\bmango(?:es)?\b/i, 'mango'],
  [/\bavocado(?:es)?\b/i, 'avocado'],
  [/\bpineapple(?:s)?\b/i, 'pineapple'],
  [/\bpotato(?:es)?\b/i, 'potato'],
  [/\bcabbage\b/i, 'cabbage'],
  [/\bcucumber(?:s)?\b/i, 'cucumber'],
  [/\bwatermelon(?:s)?\b/i, 'watermelon'],
  [/\b(?:maize|corn)\b/i, 'maize'],
  [/\bstrawberr(?:y|ies)\b/i, 'strawberry'],
  [/\bkale\b/i, 'kale'],
  [/\bgarlic\b/i, 'garlic'],
];

export function productPhotoUrl(name: string, width = 1200): string {
  const photoKey = PRODUCT_PHOTOS.find(([pattern]) => pattern.test(name))?.[1] ?? 'box';
  return photoUrl(photoKey, width);
}
