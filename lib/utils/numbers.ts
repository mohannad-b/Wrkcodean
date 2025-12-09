export function roundToPlaces(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

