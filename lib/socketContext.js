// lib/socketContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  useEffect(() => {
    // Ensure we only create a socket in browser environment
    if (typeof window === 'undefined') return;

    // Initialize socket connection with explicit server URL
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'], // Ensure both transports are available
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true, // Force a new connection
    });

    socketInstance.on('connect', () => {
      console.log('Connected to Socket.IO server');
      setIsConnected(true);
      setReconnectAttempts(0);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setReconnectAttempts((prev) => prev + 1);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Disconnected from Socket.IO server:', reason);
      setIsConnected(false);
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      console.log(`Reconnection attempt ${attemptNumber}`);
      setReconnectAttempts(attemptNumber);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
      setReconnectAttempts(0);
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('Failed to reconnect to Socket.IO server');
    });

    // Ensure socket is connected
    if (!socketInstance.connected) {
      socketInstance.connect();
    }

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      console.log('Disconnecting socket');
      socketInstance.disconnect();
    };
  }, []);

  return (
      <SocketContext.Provider value={{
        socket,
        isConnected,
        reconnectAttempts
      }}>
        {children}
      </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}