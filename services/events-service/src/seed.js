// Evenements de demonstration, dates dans les jours qui viennent.
const inDays = (days, hour) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

export const seedEvents = () => [
  {
    title: 'Conférence Kubernetes',
    description: 'Retour d’expérience sur la mise en production de microservices.',
    location: 'Amphi A',
    date: inDays(7, 18),
    capacity: 80,
  },
  {
    title: 'Tournoi d’échecs',
    description: 'Parties rapides, tous niveaux acceptés.',
    location: 'Foyer',
    date: inDays(12, 14),
    capacity: 16,
  },
  {
    title: 'Atelier Docker',
    description: 'Écrire son premier Dockerfile. Places très limitées.',
    location: 'Salle B204',
    date: inDays(15, 10),
    capacity: 2,
  },
];
