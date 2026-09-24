import { Bus, Car, Caravan, Construction, Forklift, Truck } from 'lucide-react';
import type { VehicleType } from '../types';

export function VehicleIcon({ type, size = 22 }: { type: VehicleType; size?: number }) {
  switch (type) {
    case 'Car': return <Car size={size} />;
    case 'Van': return <Bus size={size} />;
    case 'Trailer': return <Caravan size={size} />;
    case 'Forklift': return <Forklift size={size} />;
    case 'Excavator': return <Construction size={size} />;
    default: return <Truck size={size} />;
  }
}
