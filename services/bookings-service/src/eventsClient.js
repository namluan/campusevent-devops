import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const PROTO_PATH = fileURLToPath(new URL('../../../proto/events.proto', import.meta.url));
const { campusevents } = grpc.loadPackageDefinition(protoLoader.loadSync(PROTO_PATH));

const TIMEOUT_MS = 3000;

// Client gRPC de events-service. L'adresse vient de la configuration (EVENTS_GRPC_URL),
// jamais du code : dans Kubernetes c'est le nom DNS du Service.
export function createEventsClient(address) {
  const client = new campusevents.EventsService(address, grpc.credentials.createInsecure(), {
    // Se reconnecte vite quand le pod events-service est recree.
    'grpc.initial_reconnect_backoff_ms': 500,
    'grpc.max_reconnect_backoff_ms': 3000,
  });

  const call = (method) => (id) =>
    new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + TIMEOUT_MS);
      client[method]({ id }, { deadline }, (error, event) => (error ? reject(error) : resolve(event)));
    });

  return {
    getEvent: call('getEvent'),
    reserveSeat: call('reserveSeat'),
    releaseSeat: call('releaseSeat'),
    close: () => client.close(),
  };
}

export const isNotFound = (error) => error.code === grpc.status.NOT_FOUND;
export const isFull = (error) => error.code === grpc.status.RESOURCE_EXHAUSTED;
