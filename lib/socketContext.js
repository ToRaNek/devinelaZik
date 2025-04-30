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

  // Initialize socket connection when session is ready
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      console.log('Session not ready yet, delaying socket connection');
      return () => {};
    }

    console.log('🔄 Initializing socket connection with user ID:', session.user.id);
    setConnectionStatus('connecting');

    // Créer une nouvelle instance avec une configuration robuste
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      // Commencer par polling qui est plus fiable pour l'établissement initial
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 30000,
      auth: { userId: session.user.id },
      withCredentials: true,
      forceNew: true
    });

    // Event listeners
    socketInstance.on('connect', () => {
      console.log('✅ Socket connected successfully!', socketInstance.id);
      setIsConnected(true);
      setLastError(null);
      setConnectionStatus('connected');
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
      setConnectionStatus('error');
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      setLastError(error.message);
      setIsConnected(false);
      setConnectionStatus('error');
    });

    socketInstance.on('error', (error) => {
      console.error('❌ Socket error:', error);
      setLastError(typeof error === 'string' ? error : error.message || 'Unknown error');
      setConnectionStatus('error');
    });

    socketInstance.on('serverAck', (data) => {
      console.log('📣 Server acknowledgment:', data);
    });

    socketInstance.on('heartbeat', (data) => {
      console.log('❤️ Heartbeat received:', data);
    });

    // Store the socket instance
    setSocket(socketInstance);

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up socket...');
      socketInstance.disconnect();
    };
  }, [session, status]);

  // Fonction pour forcer la reconnexion
  const reconnect = useCallback(() => {
    console.log('🔄 Forcing socket reconnection...');
    setConnectionStatus('connecting');

    if (socket) {
      if (socket.connected) {
        socket.disconnect();
      }

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