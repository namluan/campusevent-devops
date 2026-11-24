import { seedEvents } from './seed.js';

// Stockage en memoire : les donnees disparaissent au redemarrage.
export function createMemoryRepository({ seed = true } = {}) {
  const events = new Map();
  let nextId = 1;

  const repository = {
    async init() {
      if (seed) for (const event of seedEvents()) await repository.create(event);
    },
    async isReady() {
      return true;
    },
    async list() {
      return [...events.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
    async get(id) {
      return events.get(id) ?? null;
    },
    async create({ title, description, location, date, capacity }) {
      const event = { id: nextId++, title, description, location, date, capacity, seatsLeft: capacity };
      events.set(event.id, event);
      return event;
    },
    // Ne supprime que si aucune place n'est reservee. Renvoie true si supprime.
    async removeIfEmpty(id) {
      const event = events.get(id);
      if (!event || event.seatsLeft !== event.capacity) return false;
      return events.delete(id);
    },
    // Renvoie null si l'evenement est complet ou inexistant.
    async reserveSeat(id) {
      const event = events.get(id);
      if (!event || event.seatsLeft === 0) return null;
      event.seatsLeft -= 1;
      return event;
    },
    async releaseSeat(id) {
      const event = events.get(id);
      if (!event) return null;
      event.seatsLeft = Math.min(event.seatsLeft + 1, event.capacity);
      return event;
    },
    async close() {},
  };
  return repository;
}
