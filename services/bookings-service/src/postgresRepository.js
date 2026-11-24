import pg from 'pg';

const toBooking = (row) =>
  row && {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };

export function createPostgresRepository(config) {
  const pool = new pg.Pool({ ...config, connectionTimeoutMillis: 3000 });
  // Sans ce gestionnaire, la perte d'une connexion inactive arreterait le processus.
  pool.on('error', (error) => console.error('Connexion PostgreSQL perdue :', error.message));

  let initialized = false;

  return {
    // Le verrou evite que deux replicas creent la table en meme temps.
    async init() {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(1)');
        await client.query(`CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          event_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (event_id, email)
        )`);
        await client.query('COMMIT');
        initialized = true;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async isReady() {
      if (!initialized) throw new Error('Base pas encore initialisée');
      await pool.query('SELECT 1');
      return true;
    },
    async listByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM bookings WHERE email = $1 ORDER BY id', [email]);
      return rows.map(toBooking);
    },
    async exists(eventId, email) {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM bookings WHERE event_id = $1 AND email = $2',
        [eventId, email],
      );
      return rowCount > 0;
    },
    // Renvoie null si cette personne a deja reserve cet evenement.
    async create({ eventId, name, email }) {
      const { rows } = await pool.query(
        `INSERT INTO bookings (event_id, name, email) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, email) DO NOTHING RETURNING *`,
        [eventId, name, email],
      );
      return toBooking(rows[0]) ?? null;
    },
    // Renvoie la reservation supprimee, ou null.
    async remove(id) {
      const { rows } = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING *', [id]);
      return toBooking(rows[0]) ?? null;
    },
    // Remet une reservation supprimee (compensation).
    async restore({ id, eventId, name, email, createdAt }) {
      await pool.query(
        `INSERT INTO bookings (id, event_id, name, email, created_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [id, eventId, name, email, createdAt],
      );
    },
    async close() {
      await pool.end();
    },
  };
}
