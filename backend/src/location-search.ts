import { Router } from 'express';
import { z } from 'zod';

export const locationSearchRouter = Router();

const searchSchema = z.object({ query: z.string().trim().min(3).max(250) });
const geocodingSchema = z.object({
  status: z.string(),
  results: z.array(z.object({
    place_id: z.string(),
    formatted_address: z.string(),
    partial_match: z.boolean().optional(),
    geometry: z.object({
      location: z.object({
        lat: z.number().finite().min(-90).max(90),
        lng: z.number().finite().min(-180).max(180),
      }),
    }),
  })),
});

locationSearchRouter.post('/location/search', async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter an address with at least three characters.' });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: 'Address search is not configured. Use GPS or a saved address.' });
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', parsed.data.query);
    url.searchParams.set('key', key);
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`Address search returned HTTP ${response.status}.`);
    const result = geocodingSchema.parse(await response.json());
    if (result.status === 'ZERO_RESULTS') return res.json({ places: [] });
    if (result.status !== 'OK') throw new Error(`Address search returned ${result.status}.`);
    return res.json({
      places: result.results.slice(0, 5).map((place) => ({
        id: place.place_id,
        label: place.formatted_address,
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        partial_match: place.partial_match ?? false,
      })),
    });
  } catch (error) {
    console.error('Could not search delivery addresses:', error);
    return res.status(503).json({ error: 'Address search is temporarily unavailable. Try again or use GPS.' });
  }
});
