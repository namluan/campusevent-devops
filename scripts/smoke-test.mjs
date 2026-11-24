// Parcours complet a travers la gateway.
// Usage : node scripts/smoke-test.mjs [http://localhost:8080]
import assert from 'node:assert/strict';
import { request } from 'node:http';

const base = process.argv[2] ?? 'http://localhost:8080';
const email = (n) => `test${n}-${Date.now()}@example.com`;

// node:http plutot que fetch : Node ne resout pas *.localhost sous Windows.
function call(method, path, body) {
  const url = new URL(path, base);
  const payload = body && JSON.stringify(body);
  const headers = { Host: url.host };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  const hostname = url.hostname.endsWith('localhost') ? '127.0.0.1' : url.hostname;
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port: url.port || 80, path, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => {
        let data = text;
        try {
          data = JSON.parse(text);
        } catch {}
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
const step = (label) => console.log(`ok  ${label}`);

const page = await call('GET', '/');
assert.equal(page.status, 200);
assert.match(page.data, /<div id="root">/);
step('le front est servi');

const date = new Date(Date.now() + 86_400_000).toISOString();
const created = await call('POST', '/api/events', { title: 'Smoke test', location: 'CI', date, capacity: 2 });
assert.equal(created.status, 201);
const eventId = created.data.id;
step('événement créé (REST -> events-service)');

// 10 demandes simultanees pour 2 places.
const results = await Promise.all(
  Array.from({ length: 10 }, (_, n) =>
    call('POST', '/api/bookings', { eventId, name: 'Test', email: email(n) }),
  ),
);
const booked = results.filter((r) => r.status === 201).map((r) => r.data);
assert.deepEqual(results.map((r) => r.status).sort(), [201, 201, ...Array(8).fill(409)]);
assert.equal((await call('GET', `/api/events/${eventId}`)).data.seatsLeft, 0);
step('10 réservations simultanées pour 2 places : 2 acceptées, 8 refusées (gRPC)');

const mine = await call('GET', `/api/bookings?email=${encodeURIComponent(booked[0].email)}`);
assert.equal(mine.data[0].event.title, 'Smoke test');
step('réservation retrouvée avec le détail de l’événement');

assert.equal((await call('DELETE', `/api/events/${eventId}`)).status, 409);
step('suppression refusée tant que des places sont prises');

for (const booking of booked) assert.equal((await call('DELETE', `/api/bookings/${booking.id}`)).status, 204);
assert.equal((await call('GET', `/api/events/${eventId}`)).data.seatsLeft, 2);
step('annulations : les places sont rendues');

assert.equal((await call('DELETE', `/api/events/${eventId}`)).status, 204);
step('événement supprimé');
