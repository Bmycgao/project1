import { defineEventHandler } from 'h3';

/** Used by the local Vite launcher to verify the mock backend is ready. */
export default defineEventHandler(() => ({
  service: '@vben/backend-mock',
  status: 'ok',
}));
