const PRODUCT_PHOTOS: readonly [RegExp, string][] = [
  [/\btomato(?:es)?\b/i, 'photo-1592924357228-91a4daadcfea'],
  [/\bcarrot(?:s)?\b/i, 'photo-1598170845058-32b9d6a5da37'],
  [/\bspinach\b/i, 'photo-1576045057995-568f588f82fb'],
  [/\bbanana(?:s)?\b/i, 'photo-1571771894821-ce9b6c11b08e'],
  [/\bonion(?:s)?\b/i, 'photo-1618512496248-a07fe83aa8cb'],
  [/\borange(?:s)?\b/i, 'photo-1547514701-42782101795e'],
  [/\bpepper(?:s)?\b/i, 'photo-1563565375-f3fdfdbefa83'],
  [/\bmango(?:es)?\b/i, 'photo-1553279768-865429fa0078'],
  [/\bavocado(?:es)?\b/i, 'photo-1523049673857-eb18f1d7b578'],
  [/\bpineapple(?:s)?\b/i, 'photo-1550258987-190a2d41a8ba'],
  [/\bpotato(?:es)?\b/i, 'photo-1518977676601-b53f82aba655'],
  [/\bcabbage\b/i, 'photo-1594282486552-05b4d80fbb9f'],
  [/\bcucumber(?:s)?\b/i, 'photo-1604977042946-1eecc30f269e'],
  [/\bwatermelon(?:s)?\b/i, 'photo-1587049352846-4a222e784d38'],
  [/\b(?:maize|corn)\b/i, 'photo-1551754655-cd27e38d2076'],
  [/\bstrawberr(?:y|ies)\b/i, 'photo-1464965911861-746a04b4bca6'],
  [/\bkale\b/i, 'photo-1524179091875-bf99a9a6af57'],
  [/\bgarlic\b/i, 'photo-1540148426945-6cf22a6b2383'],
];

export function productPhotoUrl(name: string, width = 960): string {
  const photo = PRODUCT_PHOTOS.find(([pattern]) => pattern.test(name))?.[1] ?? 'photo-1542838132-92c53300491e';
  return `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=${width}&q=80`;
}
