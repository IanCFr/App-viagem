import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
    manifest: {
      name: 'João Pessoa a dois', short_name: 'Nossa viagem', lang: 'pt-BR',
      description: 'Os gastos da viagem de Ian e Lara.', start_url: '/', scope: '/',
      display: 'standalone', background_color: '#FFF8F2', theme_color: '#FFF8F2',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallbackDenylist: [/^\/api\//], cleanupOutdatedCaches: true }
  })],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } }
});
