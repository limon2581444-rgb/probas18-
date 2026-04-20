import { io } from "socket.io-client";

// In development, the socket server is on the same port
const SOCKET_URL = window.location.origin;

export const socket = io(SOCKET_URL, {
  autoConnect: false,
});
