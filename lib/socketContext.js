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
  const [connectionStatus, setConnectionStatus] = useState('pending'); // 'pending', 'connecting', 'connected', 'error'

  const connect = useCallback(() => {
    // Ne se connecter que si l'utilisateur est authentifié
    if (status !== 'authenticated' || !session?.user?.id) {
      console.log('Session not ready yet, delaying socket connection');
      return () => {}; // Cleanup function (empty)
    }

    console.log('🔄 Initializing socket connection with user ID:', session.user.id);
    setConnectionStatus('connecting');

    // Créer une nouvelle instance
    const socketInstance = io(window.location.origin, {
      // Utiliser le même path que côté serveur
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      autoConnect: false, // IMPORTANT: Ne pas se connecter automatiquement
      auth: { userId: session.user.id },
      withCredentials: true
    });

    // Logs détaillés pour le debugging
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

    // Après avoir configuré tous les event listeners, se connecter
    socketInstance.connect();

    // Enregistrer l'instance
    setSocket(socketInstance);

    // Nettoyage
    return () => {
      console.log('🧹 Cleaning up socket...');
      socketInstance.disconnect();
    };
  }, [session, status]);

  // Se connecter quand la session est prête
  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  // Méthode pour forcer une reconnexion
  const reconnect = useCallback(() => {
    console.log('🔄 Forcing socket reconnection...');
    setConnectionStatus('connecting');

    if (socket) {
      // Si déjà connecté, se déconnecter d'abord
      socket.disconnect();
      // Attendre un court moment avant de se reconnecter
      setTimeout(() => {
        socket.auth = { userId: session?.user?.id };
        socket.connect();
      }, 500);
    } else {
      // Sinon, initialiser une nouvelle connexion
      connect();
    }
  }, [socket, connect, session]);

  // Vérifier périodiquement la santé de la connexion
  useEffect(() => {
    if (!socket) return;

    const interval = setInterval(() => {
      if (socket.connected !== isConnected) {
        console.log(`Socket connection state mismatch: socket.connected=${socket.connected}, state=${isConnected}`);
        setIsConnected(socket.connected);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [socket, isConnected]);

  const value = {
    socket,
    isConnected,
    connectionStatus,
    lastError,
    reconnect
  };

  return (
      <SocketContext.Provider value={value}>
        {children}
      </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}