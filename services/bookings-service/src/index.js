import { createApp } from './app.js';
import { createEventsClient } from './eventsClient.js';
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

const events = createEventsClient(env.EVENTS_GRPC_URL ?? 'localhost:50051');
const port = Number(env.PORT ?? 3002);
const httpServer = createApp(repository, events).listen(port, (error) => {
  if (error) {
    throw error;
  }
  console.log(`bookings-service : REST ${port}, stockage ${usePostgres ? 'postgres' : 'memory'}`);
});

// Arret propre quand Kubernetes supprime le pod.
process.on('SIGTERM', () => {
  setTimeout(() => process.exit(0), 5000).unref();
  httpServer.close(async () => {
    events.close();
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
