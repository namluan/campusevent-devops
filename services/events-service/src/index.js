import { createApp } from './app.js';
import { createGrpcServer, listenGrpc } from './grpcServer.js';
import { createMemoryRepository } from './memoryRepository.js';
import { createPostgresRepository } from './postgresRepository.js';

const env = process.env;
const usePostgres = env.DB_MODE === 'postgres';

const repository = usePostgres
  ? createPostgresRepository({
      host: env.DB_HOST,
      port: Number(env.DB_PORT ?? 5432),
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    })
  : createMemoryRepository();

const grpcServer = createGrpcServer(repository);
const grpcPort = await listenGrpc(grpcServer, Number(env.GRPC_PORT ?? 50051));
const port = Number(env.PORT ?? 3001);
const httpServer = createApp(repository).listen(port, (error) => {
  if (error) throw error;
  console.log(
    `events-service : REST ${port}, gRPC ${grpcPort}, stockage ${usePostgres ? 'postgres' : 'memory'}`,
  );
});

// Arret propre quand Kubernetes supprime le pod.
process.on('SIGTERM', () => {
  setTimeout(() => process.exit(0), 5000).unref();
  grpcServer.tryShutdown(() => {});
  httpServer.close(async () => {
    await repository.close();
    process.exit(0);
  });
});

// PostgreSQL peut demarrer apres le service : on reessaie sans arreter le pod.
// Pendant ce temps /ready renvoie 503, donc Kubernetes ne lui envoie aucun trafic.
for (;;) {
  try {
    await repository.init();
    console.log('Stockage prêt');
    break;
  } catch (error) {
    console.error(`Base de données indisponible, nouvel essai : ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
