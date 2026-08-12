import axios from 'axios';
import { supabase } from '../lib/supabaseClient';

/**
 * Centralized Axios client for all backend API calls.
 *
 * Why centralize this?
 * - Keeps base URL and shared settings in one place.
 * - Makes future auth headers/interceptors easy to add globally.
 */
const api = axios.create({
  baseURL: (import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : 'http://localhost:5000/api'),
  timeout: 3000000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Arena OS endpoints are authenticated by the same Supabase session used by
// realtime matches. Resolving the token per request also handles refreshes.
api.interceptors.request.use(async (config) => {
  if (import.meta.env.VITE_E2E_TEST_AUTH === "true") {
    const id =
      new URLSearchParams(window.location.search).get("e2eUser") ||
      sessionStorage.getItem("socratic-e2e-user") ||
      "e2e-user";
    config.headers.Authorization = `Bearer e2e:${id}`;
    return config;
  }
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
