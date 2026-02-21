import axios from 'axios';

/**
 * Centralized Axios client for all backend API calls.
 *
 * Why centralize this?
 * - Keeps base URL and shared settings in one place.
 * - Makes future auth headers/interceptors easy to add globally.
 */
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 3000000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
