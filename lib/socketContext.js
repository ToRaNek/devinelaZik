// lib/socketContext.js
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useSession } from 'next-auth/react';

const SocketContext = createContext();

export function SocketProvider({ children }) {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('pending');

  // Initialiser la connexion quand la session est prête
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      console.log('Session not ready, delaying socket connection');
      return () => {};
    }

    console.log('Initializing socket connection with user ID:', session.user.id);
    setConnectionStatus('connecting');

    // Création d'une nouvelle instance Socket
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'], // Essayer websocket d'abord, puis polling en fallback
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      auth: { userId: session.user.id }
    });

    // Event listeners
    socketInstance.on('connect', () => {
      console.log('Socket connected successfully!', socketInstance.id);
      setIsConnected(true);
      setLastError(null);
      setConnectionStatus('connected');
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      setConnectionStatus('error');
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setLastError(error.message);
      setIsConnected(false);
      setConnectionStatus('error');
    });

    // Stockage de l'instance
    setSocket(socketInstance);

    // Fonction de nettoyage
    return () => {
      console.log('Cleaning up socket...');
      socketInstance.disconnect();
    };
  }, [session, status]);

  // Fonction pour forcer la reconnexion
  const reconnect = useCallback(() => {
    console.log('Forcing socket reconnection...');
    setConnectionStatus('connecting');

    if (socket) {
      if (socket.connected) socket.disconnect();

      if (session?.user?.id) {
        socket.auth = { userId: session.user.id };
      }

      setTimeout(() => {
        socket.connect();
      }, 500);
    }
  }, [socket, session]);

  return (
      <SocketContext.Provider value={{
        socket,
        isConnected,
        connectionStatus,
        lastError,
        reconnect
      }}>
        {children}
      </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}