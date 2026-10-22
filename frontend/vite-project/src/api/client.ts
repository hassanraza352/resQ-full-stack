import axios, { AxiosError } from "axios";

export const API_URL: string =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Socket.IO lives on the same host as the API, without the /api suffix
export const SOCKET_URL: string = API_URL.replace(/\/api\/?$/, "");

/** Cookie-based auth (HTTP-only JWT): always send credentials. */
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

/** Turns any thrown value into a message that is safe to show to the user. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<{ message?: string }>;
    if (e.response?.data?.message) return e.response.data.message;
    if (e.code === "ECONNABORTED") return "The server took too long to respond.";
    if (!e.response) return "Cannot reach the server. Check your connection and retry.";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function statusOf(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}
