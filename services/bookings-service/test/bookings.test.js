import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
// Le vrai serveur gRPC de events-service : le contrat est teste de bout en bout.
import { createGrpcServer, listenGrpc } from '../../events-service/src/grpcServer.js';
import { createMemoryRepository as createEventsRepository } from '../../events-service/src/memoryRepository.js';
import { createApp } from '../src/app.js';
import { createEventsClient } from '../src/eventsClient.js';
import { createMemoryRepository } from '../src/memoryRepository.js';

let eventsRepository;
let repository;
let grpcServer;
let httpServer;
let client;
let events;
let url;

const current = (get) => new Proxy({}, { get: (_, name) => get()[name] });

before(async () => {
  grpcServer = createGrpcServer(current(() => eventsRepository));
  client = createEventsClient(`localhost:${await listenGrpc(grpcServer, 0)}`);
  httpServer = createApp(current(() => repository), current(() => events)).listen(0);
  await new Promise((resolve) => httpServer.once('listening', resolve));
  url = `http://localhost:${httpServer.address().port}/api/bookings`;
});
after(() => {
  client.close();
  grpcServer.forceShutdown();
  httpServer.close();
});
beforeEach(async () => {
  eventsRepository = createEventsRepository({ seed: false });
  await eventsRepository.create({
    title: 'Test', description: '', location: 'Amphi', date: '2099-01-01T10:00:00.000Z', capacity: 2,
  });
  repository = createMemoryRepository();
  events = client;
});

const book = (email, eventId = 1) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, name: 'Alice', email }),
  });
const seatsLeft = async () => (await eventsRepository.get(1)).seatsLeft;

test('réserve, liste avec le détail de l’événement, puis annule', async () => {
  const response = await book('Alice@Efrei.fr');
  assert.equal(response.status, 201);
  const { id } = await response.json();
  assert.equal(await seatsLeft(), 1);

  const list = await (await fetch(`${url}?email=alice@efrei.fr`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].event.title, 'Test');
  assert.equal(list[0].event.seatsLeft, 1);

  assert.equal((await fetch(`${url}/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal(await seatsLeft(), 2);
  assert.equal((await fetch(`${url}/${id}`, { method: 'DELETE' })).status, 404);
});

test('refuse un événement complet', async () => {
  assert.equal((await book('a@x.fr')).status, 201);
  assert.equal((await book('b@x.fr')).status, 201);
  assert.equal((await book('c@x.fr')).status, 409);
  assert.equal(await seatsLeft(), 0);
});

test('refuse une double réservation sans prendre de place', async () => {
  await book('a@x.fr');
  assert.equal((await book('A@X.fr')).status, 409);
  assert.equal(await seatsLeft(), 1);
});

test('404 si l’événement n’existe pas, 400 si les données sont invalides', async () => {
  assert.equal((await book('a@x.fr', 42)).status, 404);
  assert.equal((await book('pas-un-email')).status, 400);
  assert.equal((await book('a@x.fr', 'un')).status, 400);
  assert.equal((await fetch(url)).status, 400);
});

test('rend la place si l’enregistrement échoue', async () => {
  repository.create = async () => {
    throw new Error('panne base');
  };
  assert.equal((await book('a@x.fr')).status, 500);
  assert.equal(await seatsLeft(), 2);
});

test('rend la place si une réservation concurrente est passée avant', async () => {
  repository.create = async () => null;
  assert.equal((await book('a@x.fr')).status, 409);
  assert.equal(await seatsLeft(), 2);
});

test('503 si events-service est en panne, et l’annulation est défaite', async () => {
  const { id } = await (await book('a@x.fr')).json();
  events = createEventsClient('localhost:1');
  assert.equal((await book('b@x.fr')).status, 503);
  assert.equal((await fetch(`${url}/${id}`, { method: 'DELETE' })).status, 503);
  const list = await (await fetch(`${url}?email=a@x.fr`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].event, null);
  events.close();
});
