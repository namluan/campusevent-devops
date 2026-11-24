import express from 'express';

const parseId = (value) => (/^[1-9]\d{0,8}$/.test(value) ? Number(value) : null);

const isText = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

function validateEvent(body) {
  const { title, description = '', location, date, capacity } = body ?? {};
  const errors = [];
  if (!isText(title, 100)) errors.push('title est obligatoire (100 caractères maximum)');
  if (!isText(location, 100)) errors.push('location est obligatoire (100 caractères maximum)');
  if (typeof description !== 'string' || description.length > 500)
    errors.push('description : 500 caractères maximum');
  const parsedDate = typeof date === 'string' ? new Date(date) : new Date(NaN);
  if (Number.isNaN(parsedDate.getTime())) errors.push('date est invalide');
  else if (parsedDate <= new Date()) errors.push('date doit être dans le futur');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)
    errors.push('capacity doit être un entier entre 1 et 10000');
  if (errors.length) return { errors };
  return {
    event: {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      date: parsedDate.toISOString(),
      capacity,
    },
  };
}

export function createApp(repository) {
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

  app.get('/api/events', async (req, res) => {
    res.json(await repository.list());
  });

  app.get('/api/events/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const event = id && (await repository.get(id));
    if (!event) return res.status(404).json({ error: 'Événement introuvable' });
    res.json(event);
  });

  app.post('/api/events', async (req, res) => {
    const { event, errors } = validateEvent(req.body);
    if (errors) return res.status(400).json({ error: errors.join(', ') });
    res.status(201).json(await repository.create(event));
  });

  app.delete('/api/events/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id && (await repository.removeIfEmpty(id))) return res.status(204).end();
    if (!id || !(await repository.get(id)))
      return res.status(404).json({ error: 'Événement introuvable' });
    res.status(409).json({ error: 'Des places sont déjà réservées pour cet événement' });
  });

  app.use((error, req, res, next) => {
    if (error.status >= 400 && error.status < 500)
      return res.status(error.status).json({ error: 'Requête invalide' });
    console.error(error);
    res.status(500).json({ error: 'Erreur interne' });
  });

  return app;
}
