import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En developpement (npm run dev), Vite joue le role de la gateway.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/events': 'http://localhost:3001',
      '/api/bookings': 'http://localhost:3002',
    },
  },
});
