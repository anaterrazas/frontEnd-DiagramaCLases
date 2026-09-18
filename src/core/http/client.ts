// src/core/http/client.ts
import axios from 'axios';
import { setupInterceptors } from './interceptors';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 50000,
});

setupInterceptors(client);

export default client;
