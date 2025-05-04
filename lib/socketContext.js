// lib/socketContext.js
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useSession } from 'next-auth/react';

const SocketContext = createContext();

export function SocketProvider({ children }) {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('pending');

  // Use refs to track visibility
  const visibilityRef = useRef(true);

  // When page visibility changes, pause/resume reconnection
  useEffect(() => {
    const handleVisibility = () => {
      visibilityRef.current = !document.hidden;
      if (visibilityRef.current && socket && !socket.connected) {
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [socket]);

  useEffect(() => {
    if (!session) return;

    // Initial socket setup with backoff and limited attempts
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,           // max retries
      reconnectionDelay: 1000,           // initial delay
      reconnectionDelayMax: 5000,        // max delay between tries
      randomizationFactor: 0.5,          // randomness in delay
      timeout: 20000,                    // connection timeout
      pingInterval: 10000,               // heartbeat interval
      pingTimeout: 20000,                // heartbeat timeout
      auth: { userId: session.user.id },
      withCredentials: true,
      forceNew: true
    });

    // Handlers
    socketInstance.on('connect', () => {
      console.log('✅ Socket connected!', socketInstance.id);
      setIsConnected(true);
      setConnectionStatus('connected');
      setLastError(null);
    });

    socketInstance.on('disconnect', (reason) => {
      console.warn('🔌 Disconnected:', reason);
      setIsConnected(false);
      setConnectionStatus('disconnected');
      // If still within attempts and page visible, auto-reconnect
      if (visibilityRef.current && socketInstance.io.reconnectionAttempts() < 6) {
        socketInstance.connect();
      }
    });

    socketInstance.on('connect_error', (err) => {
      console.error('⚠️ Connection error:', err.message);
      setLastError(err);
      setConnectionStatus('error');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.off();
      socketInstance.close();
    };
  }, [session]);

  // Manual reconnect (if needed)
  const reconnect = useCallback(() => {
    if (socket && !socket.connected) {
      setConnectionStatus('reconnecting');
      socket.connect();
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionStatus, lastError, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
