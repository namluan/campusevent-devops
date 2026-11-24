# CampusEvents

Réservation de places pour les événements d'un campus. Projet d'intégration cloud : deux microservices, Docker, Kubernetes, PostgreSQL. La conception est dans [CR.md](CR.md).

| Composant | Rôle | Ports |
|---|---|---|
| `services/events-service` | Événements et places (REST, serveur gRPC) | 3001, 50051 |
| `services/bookings-service` | Réservations (REST, client gRPC) | 3002 |
| `frontend` | Interface React servie par nginx | 8080 |
| PostgreSQL | Une base et un utilisateur par service | 5432 |

Avancement : étapes 1 à 4 faites (service, Ingress, deuxième service, base de données). Le service mesh et la sécurité restent à faire.

Toutes les commandes se lancent depuis la racine du projet, dans PowerShell.

## Tests unitaires

```powershell
npm --prefix services/events-service ci
npm --prefix services/events-service test
npm --prefix services/bookings-service ci
npm --prefix services/bookings-service test
```

## En local, sans Kubernetes

Copier `.env.example` en `.env`, changer les mots de passe, puis :

```powershell
docker compose up --build -d
```

Ouvrir <http://localhost:8080>. Parcours de test automatique :

```powershell
node scripts/smoke-test.mjs http://localhost:8080
```

Arrêt : `docker compose down` (ajouter `-v` pour effacer aussi les données).

## Images Docker

Les images sont nommées `namluuu/...`. Pour un autre compte Docker Hub, remplacer ce préfixe dans `docker-compose.yml` et `k8s/`.

```powershell
docker compose build
docker login
docker compose push events-service bookings-service frontend
```

Sans publier sur Docker Hub, on peut charger les images directement dans minikube :

```powershell
minikube image load namluuu/events-service:1.0
minikube image load namluuu/bookings-service:1.0
minikube image load namluuu/frontend:1.0
```

Après une modification du code, changer de numéro de version (`1.1`) : Kubernetes garde une image `1.0` déjà présente.

## Kubernetes

```powershell
minikube start --driver=docker
minikube addons enable ingress
```

### Étape 1 : un service

```powershell
kubectl apply -f k8s/01-service/
kubectl -n campusevents get all
```

Appel direct, dans un second terminal : `kubectl -n campusevents port-forward svc/events-service 3001:3001`, puis <http://localhost:3001/api/events>.

### Étape 2 : Ingress

```powershell
kubectl apply -f k8s/02-ingress/
```

Dans un second terminal, à laisser ouvert :

```powershell
kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 8088:80
```

Ouvrir <http://campusevents.localhost:8088/api/events>. Aucune modification du fichier hosts n'est nécessaire : les navigateurs et curl associent `*.localhost` à la machine locale.

### Étape 3 : deuxième service, gRPC et front

```powershell
kubectl apply -f k8s/03-services/
```

Ouvrir <http://campusevents.localhost:8088>. Les données sont encore en mémoire : garder un seul réplica.

### Étape 4 : PostgreSQL

Copier `k8s/04-database/secret.yaml.example` en `secret.yaml` et changer les mots de passe (`secret.yaml` n'est jamais versionné), puis :

```powershell
kubectl apply -f k8s/04-database/
kubectl -n campusevents rollout restart deploy/events-service deploy/bookings-service
```

Le redémarrage est nécessaire : un pod lit sa configuration seulement au lancement. Ne pas réappliquer ensuite tout le dossier `01-service` ou `03-services`, qui remettrait le stockage en mémoire.

Vérifications :

```powershell
node scripts/smoke-test.mjs http://campusevents.localhost:8088
kubectl -n campusevents delete pod -l app=postgres
kubectl -n campusevents scale deploy/events-service deploy/bookings-service --replicas=2
```

Les données doivent être conservées après la suppression du pod PostgreSQL.

### Tout supprimer

```powershell
kubectl delete namespace campusevents
```

## Avant le TP service mesh

- Les ports sont déjà nommés (`http`, `grpc`, `tcp-postgres`) et les pods portent les labels `app` et `version`, qu'Istio utilise.
- L'Ingress nginx est à supprimer quand la Gateway Istio prend le relais.
- Une connexion gRPC reste ouverte vers un seul pod : avec plusieurs réplicas de `events-service`, la charge n'est pas répartie. C'est un point que le service mesh corrige.
- minikube a besoin de plus de mémoire qu'ici (5 Go dans le TP du prof).
