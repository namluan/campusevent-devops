import express from 'express';
import { isFull, isNotFound } from './eventsClient.js';

const parseId = (value) => (/^[1-9]\d{0,8}$/.test(value) ? Number(value) : null);

const normalizeEmail = (value) => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

function validateBooking(body) {
  const { eventId, name } = body ?? {};
  const email = normalizeEmail(body?.email);
  const errors = [];
  if (!Number.isInteger(eventId) || eventId < 1 || eventId > 999_999_999)
    errors.push('eventId est invalide');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
    errors.push('name est obligatoire (100 caractères maximum)');
  if (!email) errors.push('email est invalide');
  return errors.length ? { errors } : { booking: { eventId, name: name.trim(), email } };
}

export function createApp(repository, events) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // /health : le processus tourne. /ready : la base de donnees repond.
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (req, res) => {
    try {
      await repository.isReady();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ error: 'Base de données injoignable' });
    }
  });

  const unavailable = (res, error) => {
    console.error('events-service injoignable :', error.message);
    res.status(503).json({ error: 'Le service des événements est indisponible' });
  };

  // Rend une place prise en trop, sans masquer l'erreur d'origine.
  const compensate = (eventId) =>
    events
      .releaseSeat(eventId)
      .catch((error) => console.error(`Place non rendue (événement ${eventId}) :`, error.message));

  app.get('/api/bookings', async (req, res) => {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ error: 'email est invalide' });
    const bookings = await repository.listByEmail(email);
    // Ajoute les details de l'evenement. S'ils sont injoignables, la liste reste utilisable.
    const withEvent = bookings.map(async (booking) => ({
      ...booking,
      event: await events.getEvent(booking.eventId).catch(() => null),
    }));
    res.json(await Promise.all(withEvent));
  });

  app.post('/api/bookings', async (req, res) => {
    const { booking, errors } = validateBooking(req.body);
    if (errors) return res.status(400).json({ error: errors.join(', ') });
    const alreadyBooked = () =>
      res.status(409).json({ error: 'Vous avez déjà réservé cet événement' });
    if (await repository.exists(booking.eventId, booking.email)) return alreadyBooked();

    // 1. Prendre une place chez events-service.
    try {
      await events.reserveSeat(booking.eventId);
    } catch (error) {
      if (isNotFound(error)) return res.status(404).json({ error: 'Événement introuvable' });
      if (isFull(error)) return res.status(409).json({ error: 'Cet événement est complet' });
      return unavailable(res, error);
    }

    // 2. Enregistrer la reservation ; si cela echoue, rendre la place.
    let created;
    try {
      created = await repository.create(booking);
    } catch (error) {
      await compensate(booking.eventId);
      throw error;
    }
    if (!created) {
      await compensate(booking.eventId);
      return alreadyBooked();
    }
    res.status(201).json(created);
  });

  app.delete('/api/bookings/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const booking = id && (await repository.remove(id));
    if (!booking) return res.status(404).json({ error: 'Réservation introuvable' });
    try {
      await events.releaseSeat(booking.eventId);
    } catch (error) {
      // Place non rendue : on remet la reservation pour que les deux services restent d'accord.
      if (!isNotFound(error)) {
        await repository.restore(booking);
        return unavailable(res, error);
      }
    }
    res.status(204).end();
  });

  app.use((error, req, res, next) => {
    if (error.status >= 400 && error.status < 500)
      return res.status(error.status).json({ error: 'Requête invalide' });
    console.error(error);
    res.status(500).json({ error: 'Erreur interne' });
  });

  return app;
}
