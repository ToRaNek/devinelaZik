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

  // Use refs to track visibility and reconnection attempts
  const visibilityRef = useRef(true);
  const reconnectTimerRef = useRef(null);
  const socketRef = useRef(null);

  // Track page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      visibilityRef.current = isVisible;

      console.log(`📱 Page visibility changed: ${isVisible ? 'visible' : 'hidden'}`);

      // If page becomes visible and socket is disconnected, try to reconnect
      if (isVisible && socketRef.current && !socketRef.current.connected) {
        console.log('Page became visible - reconnecting socket');
        reconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Initialize socket connection when session is ready
  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) {
      console.log('Session not ready yet, delaying socket connection');
      return () => {};
    }

    console.log('🔄 Initializing socket connection with user ID:', session.user.id);
    setConnectionStatus('connecting');

    // Ping interval needs to be short enough to keep connections alive in background
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 30000,
      pingInterval: 10000, // More frequent pings to keep connection alive
      pingTimeout: 30000,   // Longer timeout for pings
      auth: { userId: session.user.id },
      withCredentials: true,
      forceNew: true
    });

    socketRef.current = socketInstance;

    // Event listeners
    socketInstance.on('connect', () => {
      console.log('✅ Socket connected successfully!', socketInstance.id);
      setIsConnected(true);
      setLastError(null);
      setConnectionStatus('connected');

      // Clear any reconnection timers
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
      setConnectionStatus('error');

      // Auto-reconnect if page is visible
      if (visibilityRef.current && ['io server disconnect', 'transport close'].includes(reason)) {
        console.log('Auto-reconnecting after disconnect...');
        reconnectTimerRef.current = setTimeout(() => {
          reconnect();
        }, 2000);
      }
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
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      socketInstance.disconnect();
    };
  }, [session, status]);

  // Fonction pour forcer la reconnexion
  const reconnect = useCallback(() => {
    console.log('🔄 Forcing socket reconnection...');
    setConnectionStatus('connecting');

    if (socketRef.current) {
      if (socketRef.current.connected) {
        socketRef.current.disconnect();
      }

      if (session?.user?.id) {
        socketRef.current.auth = { userId: session.user.id };
      }

      setTimeout(() => {
        socketRef.current.connect();
      }, 500);
    }
  }, [session]);

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