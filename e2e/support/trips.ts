import { findAirport } from '@/lib/airports';
import { addDays, defaultTravelDate, isoDate } from '@/lib/dates';
import { formatTripDate, searchFlights, type Fare, type Flight } from '@/lib/flights';
import { formatCents, perTravelerCents } from '@/lib/pricing';

export type Trip = {
  from: string;
  to: string;
  date: string;
  fromCity: string;
  toCity: string;
  flights: Flight[];
};

/** A departure date a week after the site's default, so the test really picks one. */
export function pickTravelDate(now = new Date()): string {
  return isoDate(addDays(new Date(`${defaultTravelDate(now)}T12:00:00Z`), 7));
}

export function expectedTrip(from: string, to: string, date: string): Trip {
  const origin = findAirport(from);
  const destination = findAirport(to);
  if (!origin || !destination) throw new Error(`Unknown airport in ${from} → ${to}`);
  return { from, to, date, fromCity: origin.city, toCity: destination.city, flights: searchFlights(from, to, date) };
}

export function farePrice(fare: Fare): string {
  return formatCents(perTravelerCents(fare));
}

export function tripDateLabel(date: string): string {
  return formatTripDate(date);
}

export function flightName(flight: Flight): string {
  return `${flight.flightNumber}, departs ${flight.departs}, arrives ${flight.arrives}`;
}
