import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createMemoryRepository } from '../src/memoryRepository.js';

let repository;
let server;
let url;

// Un stockage neuf a chaque test, derriere la meme application.
const app = createApp(new Proxy({}, { get: (_, name) => repository[name] }));
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
const valid = () => ({ title: 'Test', location: 'Amphi', date: tomorrow(), capacity: 2 });
const post = (body) =>
  fetch(`${url}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  url = `http://localhost:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  repository = createMemoryRepository({ seed: false });
});

test('crée puis liste un événement', async () => {
  const response = await post(valid());
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.seatsLeft, 2);
  const list = await (await fetch(`${url}/api/events`)).json();
  assert.deepEqual(list, [created]);
});

test('refuse les données invalides', async () => {
  const cases = [
    {},
    { ...valid(), title: '  ' },
    { ...valid(), capacity: 0 },
    { ...valid(), capacity: '2' },
    { ...valid(), date: 'demain' },
    { ...valid(), date: '2020-01-01T10:00:00Z' },
    '{ json cassé',
  ];
  for (const body of cases) assert.equal((await post(body)).status, 400, JSON.stringify(body));
});

test('404 pour un identifiant inconnu ou mal formé', async () => {
  for (const id of ['99', 'abc', '0', '99999999999'])
    assert.equal((await fetch(`${url}/api/events/${id}`)).status, 404);
});

test('supprime un événement vide mais pas un événement réservé', async () => {
  const event = await (await post(valid())).json();
  const remove = () => fetch(`${url}/api/events/${event.id}`, { method: 'DELETE' });
  await repository.reserveSeat(event.id);
  assert.equal((await remove()).status, 409);
  await repository.releaseSeat(event.id);
  assert.equal((await remove()).status, 204);
  assert.equal((await remove()).status, 404);
});

test('les places ne sortent jamais de [0, capacity]', async () => {
  const { id } = await (await post(valid())).json();
  assert.equal((await repository.reserveSeat(id)).seatsLeft, 1);
  assert.equal((await repository.reserveSeat(id)).seatsLeft, 0);
  assert.equal(await repository.reserveSeat(id), null);
  for (let i = 0; i < 4; i++) await repository.releaseSeat(id);
  assert.equal((await repository.get(id)).seatsLeft, 2);
});

test('/ready renvoie 503 quand la base ne répond pas', async () => {
  repository.isReady = async () => {
    throw new Error('panne');
  };
  assert.equal((await fetch(`${url}/ready`)).status, 503);
  assert.equal((await fetch(`${url}/health`)).status, 200);
});
