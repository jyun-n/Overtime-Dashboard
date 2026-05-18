import axios from 'axios';
import { useAuthStore } from './store';

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true, // HttpOnly 인증 쿠키 전송
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      useAuthStore.getState().clear();
    }
    return Promise.reject(err);
  },
);
