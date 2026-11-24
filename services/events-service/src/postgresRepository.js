import pg from 'pg';
import { seedEvents } from './seed.js';

const toEvent = (row) =>
  row && {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    date: row.date.toISOString(),
    capacity: row.capacity,
    seatsLeft: row.seats_left,
  };

const INSERT = `INSERT INTO events (title, description, location, date, capacity, seats_left)
  VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`;
const insertValues = (e) => [e.title, e.description, e.location, e.date, e.capacity];

export function createPostgresRepository(config) {
  const pool = new pg.Pool({ ...config, connectionTimeoutMillis: 3000 });
  // Sans ce gestionnaire, la perte d'une connexion inactive arreterait le processus.
  pool.on('error', (error) => console.error('Connexion PostgreSQL perdue :', error.message));

  let initialized = false;

  return {
    // Cree la table et les evenements de demonstration au tout premier demarrage.
    // Le verrou evite que deux replicas le fassent en meme temps.
    async init() {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(1)');
        const { rows } = await client.query("SELECT to_regclass('events') AS found");
        if (!rows[0].found) {
          await client.query(`CREATE TABLE events (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            location TEXT NOT NULL,
            date TIMESTAMPTZ NOT NULL,
            capacity INTEGER NOT NULL CHECK (capacity > 0),
            seats_left INTEGER NOT NULL CHECK (seats_left BETWEEN 0 AND capacity)
          )`);
          for (const event of seedEvents()) await client.query(INSERT, insertValues(event));
        }
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
    async list() {
      const { rows } = await pool.query('SELECT * FROM events ORDER BY date, id');
      return rows.map(toEvent);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
      return toEvent(rows[0]) ?? null;
    },
    async create(event) {
      const { rows } = await pool.query(INSERT, insertValues(event));
      return toEvent(rows[0]);
    },
    async removeIfEmpty(id) {
      const { rowCount } = await pool.query(
        'DELETE FROM events WHERE id = $1 AND seats_left = capacity',
        [id],
      );
      return rowCount === 1;
    },
    // Une seule requete : deux demandes simultanees ne peuvent pas prendre la meme place.
    async reserveSeat(id) {
      const { rows } = await pool.query(
        'UPDATE events SET seats_left = seats_left - 1 WHERE id = $1 AND seats_left > 0 RETURNING *',
        [id],
      );
      return toEvent(rows[0]) ?? null;
    },
    async releaseSeat(id) {
      const { rows } = await pool.query(
        'UPDATE events SET seats_left = LEAST(seats_left + 1, capacity) WHERE id = $1 RETURNING *',
        [id],
      );
      return toEvent(rows[0]) ?? null;
    },
    async close() {
      await pool.end();
    },
  };
}
