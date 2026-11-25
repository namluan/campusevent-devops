import { fileURLToPath } from 'node:url';

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const PROTO_PATH = fileURLToPath(new URL('../../../proto/events.proto', import.meta.url));
const { campusevents } = grpc.loadPackageDefinition(protoLoader.loadSync(PROTO_PATH));

const fail = (code, message) => Object.assign(new Error(message), { grpcCode: code });

// Transforme une fonction async en handler gRPC.
const handler = (action) => async (call, callback) => {
  try {
    callback(null, await action(call.request.id));
  } catch (error) {
    if (error.grpcCode) {
      return callback({ code: error.grpcCode, details: error.message });
    }
    console.error(error);
    callback({ code: grpc.status.INTERNAL, details: 'Erreur interne' });
  }
};

export function createGrpcServer(repository) {
  const found = async (promise) => {
    const event = await promise;
    if (!event) {
      throw fail(grpc.status.NOT_FOUND, 'Événement introuvable');
    }
    return event;
  };

  const server = new grpc.Server();
  server.addService(campusevents.EventsService.service, {
    getEvent: handler((id) => found(repository.get(id))),
    reserveSeat: handler(async (id) => {
      const event = await repository.reserveSeat(id);
      if (event) {
        return event;
      }
      await found(repository.get(id)); // inexistant => NOT_FOUND
      throw fail(grpc.status.RESOURCE_EXHAUSTED, 'Événement complet');
    }),
    releaseSeat: handler((id) => found(repository.releaseSeat(id))),
  });
  return server;
}

// Demarre le serveur et renvoie le port reellement utilise.
export function listenGrpc(server, port) {
  return new Promise((resolve, reject) => {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, bound) =>
      error ? reject(error) : resolve(bound),
    );
  });
}
