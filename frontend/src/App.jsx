import { useEffect, useState } from 'react';
import { api } from './api.js';

const TABS = { events: 'Événements', bookings: 'Mes réservations', create: 'Proposer un événement' };

const formatDate = (date) => ({
  day: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit' }),
  month: new Date(date).toLocaleDateString('fr-FR', { month: 'short' }),
  hour: new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
});

export default function App() {
  const [tab, setTab] = useState('events');
  const [notice, setNotice] = useState(null); // { type: 'ok' | 'error', text }

  const show = (type) => (text) => setNotice({ type, text });
  const changeTab = (next) => {
    setNotice(null);
    setTab(next);
  };

  const Page = { events: Events, bookings: Bookings, create: CreateEvent }[tab];

  return (
    <>
      <header>
        <div className="bar">
          <h1>CampusEvents</h1>
          <nav aria-label="Rubriques">
            {Object.entries(TABS).map(([key, label]) => (
              <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => changeTab(key)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <div role="status" aria-live="polite">
          {notice && <p className={`notice ${notice.type}`}>{notice.text}</p>}
        </div>
        <Page onSuccess={show('ok')} onError={show('error')} goTo={changeTab} />
      </main>
    </>
  );
}

function Ticket({ date, title, children, aside }) {
  const when = date && formatDate(date);
  return (
    <li className="ticket">
      <div className="stub">
        {when ? (
          <>
            <strong>{when.day}</strong>
            <span>{when.month}</span>
            <span>{when.hour}</span>
          </>
        ) : (
          <span>Date inconnue</span>
        )}
      </div>
      <div className="body">
        <h2>{title}</h2>
        {children}
      </div>
      <div className="aside">{aside}</div>
    </li>
  );
}

function Events({ onSuccess, onError, goTo }) {
  const [events, setEvents] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    try {
      setEvents(await api.listEvents());
      setFailed(false);
    } catch (error) {
      setFailed(true);
      onError(error.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const remove = async (event) => {
    if (!window.confirm(`Supprimer « ${event.title} » ?`)) return;
    try {
      await api.deleteEvent(event.id);
      onSuccess(`« ${event.title} » est supprimé.`);
    } catch (error) {
      onError(error.message);
    }
    load();
  };

  if (failed && !events) return <button className="primary" onClick={load}>Réessayer</button>;
  if (!events) return <p className="muted">Chargement des événements…</p>;
  if (events.length === 0)
    return (
      <div className="empty">
        <p>Aucun événement pour le moment.</p>
        <button className="primary" onClick={() => goTo('create')}>Proposer le premier</button>
      </div>
    );

  return (
    <ul className="tickets">
      {events.map((event) => {
        const full = event.seatsLeft === 0;
        return (
          <Ticket
            key={event.id}
            date={event.date}
            title={event.title}
            aside={
              <>
                <p className={full ? 'seats full' : 'seats'}>
                  {full ? 'Complet' : `${event.seatsLeft} / ${event.capacity} places`}
                </p>
                {!full && bookingId !== event.id && (
                  <button className="primary" onClick={() => setBookingId(event.id)}>Réserver</button>
                )}
                {event.seatsLeft === event.capacity && (
                  <button className="link" aria-label={`Supprimer ${event.title}`} onClick={() => remove(event)}>
                    Supprimer
                  </button>
                )}
              </>
            }
          >
            <p className="muted">{event.location}</p>
            {event.description && <p>{event.description}</p>}
            {bookingId === event.id && (
              <BookingForm
                event={event}
                onCancel={() => setBookingId(null)}
                onDone={(text) => {
                  setBookingId(null);
                  onSuccess(text);
                  load();
                }}
                onError={(text) => {
                  onError(text);
                  load();
                }}
              />
            )}
          </Ticket>
        );
      })}
    </ul>
  );
}

function BookingForm({ event, onCancel, onDone, onError }) {
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const { name, email } = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await api.createBooking({ eventId: event.id, name, email });
      onDone(`Place réservée pour « ${event.title} ».`);
    } catch (error) {
      setBusy(false);
      onError(error.message);
    }
  };

  return (
    <form className="inline" onSubmit={submit}>
      <label>
        Nom
        <input name="name" required maxLength={100} autoComplete="name" autoFocus />
      </label>
      <label>
        E-mail
        <input name="email" type="email" required maxLength={200} autoComplete="email" />
      </label>
      <button className="primary" disabled={busy}>{busy ? 'Envoi…' : 'Confirmer'}</button>
      <button type="button" className="link" onClick={onCancel}>Annuler</button>
    </form>
  );
}

function Bookings({ onSuccess, onError }) {
  const [email, setEmail] = useState('');
  const [bookings, setBookings] = useState(null);

  const load = async (address) => {
    try {
      setBookings(await api.listBookings(address));
      return true;
    } catch (error) {
      onError(error.message);
      return false;
    }
  };

  const search = (e) => {
    e.preventDefault();
    const address = new FormData(e.currentTarget).get('email');
    setEmail(address);
    load(address);
  };

  const cancel = async (booking) => {
    try {
      await api.deleteBooking(booking.id);
      onSuccess('Réservation annulée, la place est de nouveau libre.');
    } catch (error) {
      onError(error.message);
      return;
    }
    load(email);
  };

  return (
    <>
      <form className="inline search" onSubmit={search}>
        <label>
          Votre e-mail
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button className="primary">Afficher</button>
      </form>
      {bookings?.length === 0 && <p className="muted">Aucune réservation pour {email}.</p>}
      {bookings?.length > 0 && (
        <ul className="tickets">
          {bookings.map((booking) => (
            <Ticket
              key={booking.id}
              date={booking.event?.date}
              title={booking.event?.title ?? `Événement n° ${booking.eventId}`}
              aside={
                <button className="link" onClick={() => cancel(booking)}>
                  Annuler ma place
                </button>
              }
            >
              <p className="muted">{booking.event?.location ?? 'Détails momentanément indisponibles'}</p>
              <p>Au nom de {booking.name}</p>
            </Ticket>
          ))}
        </ul>
      )}
    </>
  );
}

function CreateEvent({ onError, onSuccess, goTo }) {
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      await api.createEvent({
        ...form,
        date: new Date(form.date).toISOString(),
        capacity: Number(form.capacity),
      });
      goTo('events');
      onSuccess(`« ${form.title} » est publié.`);
    } catch (error) {
      setBusy(false);
      onError(error.message);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Titre
        <input name="title" required maxLength={100} />
      </label>
      <label>
        Lieu
        <input name="location" required maxLength={100} />
      </label>
      <div className="row">
        <label>
          Date et heure
          <input name="date" type="datetime-local" required />
        </label>
        <label>
          Nombre de places
          <input name="capacity" type="number" min={1} max={10000} defaultValue={20} required />
        </label>
      </div>
      <label>
        Description (facultative)
        <textarea name="description" rows={3} maxLength={500} />
      </label>
      <button className="primary" disabled={busy}>{busy ? 'Publication…' : 'Publier'}</button>
    </form>
  );
}
