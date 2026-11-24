// Chemins relatifs : c'est la gateway qui dirige /api/... vers le bon service.
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Le serveur est injoignable. Vérifiez votre connexion.');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `Le service a répondu ${response.status}.`);
  if (data === null) throw new Error('Réponse inattendue du service.');
  return data;
}

const send = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  listEvents: () => request('/api/events'),
  createEvent: (event) => send('/api/events', event),
  deleteEvent: (id) => request(`/api/events/${id}`, { method: 'DELETE' }),
  listBookings: (email) => request(`/api/bookings?email=${encodeURIComponent(email)}`),
  createBooking: (booking) => send('/api/bookings', booking),
  deleteBooking: (id) => request(`/api/bookings/${id}`, { method: 'DELETE' }),
};
