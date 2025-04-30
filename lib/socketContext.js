// lib/socketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return;

    // Create a single socket instance that persists
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      // Important: Don't auto connect, we'll do this manually
      autoConnect: false
    });

    // Set up listeners before connecting
    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
      setIsConnected(false);
    });

    // Save the socket instance to state
    setSocket(socketInstance);

    // Connect the socket after setting up listeners
    socketInstance.connect();

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
      <SocketContext.Provider value={{ socket, isConnected }}>
        {children}
      </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}