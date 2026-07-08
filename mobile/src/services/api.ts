import axios from 'axios';

// The production server URL based on the client configuration
export const API_BASE_URL = 'https://107-175-91-211.sslip.io';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token if needed
api.interceptors.request.use(
  async (config) => {
    // TODO: Fetch token from secure storage (e.g., expo-secure-store) and attach it here
    // const token = await SecureStore.getItemAsync('userToken');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
