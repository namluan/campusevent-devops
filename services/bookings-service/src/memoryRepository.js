// Stockage en memoire : les donnees disparaissent au redemarrage.
export function createMemoryRepository() {
  const bookings = new Map();
  let nextId = 1;

  const find = (eventId, email) =>
    [...bookings.values()].find((b) => b.eventId === eventId && b.email === email);

  return {
    async init() {},
    async isReady() {
      return true;
    },
    async listByEmail(email) {
      return [...bookings.values()].filter((b) => b.email === email);
    },
    async exists(eventId, email) {
      return Boolean(find(eventId, email));
    },
    // Renvoie null si cette personne a deja reserve cet evenement.
    async create({ eventId, name, email }) {
      if (find(eventId, email)) return null;
      const booking = { id: nextId++, eventId, name, email, createdAt: new Date().toISOString() };
      bookings.set(booking.id, booking);
      return booking;
    },
    // Renvoie la reservation supprimee, ou null.
    async remove(id) {
      const booking = bookings.get(id) ?? null;
      bookings.delete(id);
      return booking;
    },
    // Remet une reservation supprimee (compensation).
    async restore(booking) {
      bookings.set(booking.id, booking);
    },
    async close() {},
  };
}
