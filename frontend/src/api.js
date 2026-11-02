import axios from 'axios';
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api', timeout: 90000 });
api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('novaToken');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
    sessionStorage.removeItem('novaToken');
    window.location.replace('/');
  }
  return Promise.reject(error);
});
export default api;
