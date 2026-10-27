import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { STORE } from './delivery';

export type Place = { lat: number; lng: number; label: string; approximate: boolean };

const FALLBACK: Place = { lat: STORE.lat + 0.018, lng: STORE.lng, label: 'Dodoma', approximate: true };
const STORAGE_KEY = 'saplaya-delivery-place';
const GENERIC_LOCATION_NAME = /(^|,\s*)(unnamed(?: road| street)?|unknown(?: location)?|your location|current area)(?=$|,\s*)/i;

type DeliveryContextValue = {
  place: Place;
  setPlace: (place: Place) => Promise<void>;
  useCurrentLocation: () => Promise<Place>;
};

const DeliveryContext = createContext<DeliveryContextValue | null>(null);

function usableArea(value: string | null | undefined): string | null {
  const name = value?.trim().replace(/\s+/g, ' ');
  return name && !GENERIC_LOCATION_NAME.test(name) ? name : null;
}

async function readAreaLabel(lat: number, lng: number): Promise<string> {
  try {
    const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const areas = [address?.district, address?.subregion, address?.city, address?.region]
      .map(usableArea)
      .filter((name): name is string => name !== null);
    const uniqueAreas = areas.filter((area, index) =>
      areas.findIndex((candidate) => candidate.toLocaleLowerCase() === area.toLocaleLowerCase()) === index
    );
    if (uniqueAreas.length > 0) return uniqueAreas.slice(0, 2).join(', ');

    const landmark = usableArea(address?.name);
    const street = usableArea(address?.street);
    return [landmark, street].filter((part): part is string => part !== null).join(', ') || 'Current area';
  } catch (error) {
    console.warn('Could not resolve the delivery area from the current location:', error);
    return 'Current area';
  }
}

async function readCurrentLocation(): Promise<Place> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Allow location access or choose a saved delivery address.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const label = await readAreaLabel(position.coords.latitude, position.coords.longitude);
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    label,
    approximate: false,
  };
}

export function DeliveryProvider({ children }: { children: React.ReactNode }) {
  const [place, setPlaceState] = useState<Place>(FALLBACK);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then(async (saved) => {
      if (saved) {
        const storedPlace = JSON.parse(saved) as Place;
        if (typeof storedPlace.label !== 'string' || GENERIC_LOCATION_NAME.test(storedPlace.label.trim())) {
          storedPlace.label = await readAreaLabel(storedPlace.lat, storedPlace.lng);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedPlace));
        }
        if (active) setPlaceState(storedPlace);
        return;
      }
      try {
        const current = await readCurrentLocation();
        if (active) {
          setPlaceState(current);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        }
      } catch {
        if (active) setPlaceState(FALLBACK);
      }
    }).catch(() => {
      if (active) setPlaceState(FALLBACK);
    });
    return () => {
      active = false;
    };
  }, []);

  const setPlace = useCallback(async (nextPlace: Place) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextPlace));
    setPlaceState(nextPlace);
  }, []);

  const useCurrentLocation = useCallback(async () => {
    const current = await readCurrentLocation();
    await setPlace(current);
    return current;
  }, [setPlace]);

  const value = useMemo(() => ({ place, setPlace, useCurrentLocation }), [place, setPlace, useCurrentLocation]);
  return React.createElement(DeliveryContext.Provider, { value }, children);
}

export function useDeliveryPlace(): Place {
  const context = useContext(DeliveryContext);
  if (!context) throw new Error('useDeliveryPlace must be used within a DeliveryProvider.');
  return context.place;
}

export function useDeliveryActions() {
  const context = useContext(DeliveryContext);
  if (!context) throw new Error('useDeliveryActions must be used within a DeliveryProvider.');
  return { setPlace: context.setPlace, useCurrentLocation: context.useCurrentLocation };
}
