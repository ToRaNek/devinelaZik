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

  // Initialize socket connection when session is ready
  useEffect(() => {
    // Don't connect if user is not authenticated
    if (status !== 'authenticated' || !session?.user?.id) {
      console.log('Session not ready yet, delaying socket connection');
      return () => {}; // Empty cleanup function
    }

    console.log('🔄 Initializing socket connection with user ID:', session.user.id);
    setConnectionStatus('connecting');

    // Create a new socket instance if it doesn't exist yet
    if (!socket) {
      const socketInstance = io(window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000,
        autoConnect: true, // Changed to true since we're ready to connect
        auth: { userId: session.user.id },
        withCredentials: true
      });

      // Set up socket event listeners
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
    } else {
      // If socket already exists, just update the auth
      socket.auth = { userId: session.user.id };

      // Reconnect if not already connected
      if (!socket.connected) {
        socket.connect();
      }

      return () => {}; // Empty cleanup when no new socket was created
    }
  }, [session, status, socket]);

  // Function to force reconnection
  const reconnect = useCallback(() => {
    console.log('🔄 Forcing socket reconnection...');
    setConnectionStatus('connecting');

    if (socket) {
      // If already connected, disconnect first
      if (socket.connected) {
        socket.disconnect();
      }

      // Update auth with latest userId from session
      if (session?.user?.id) {
        socket.auth = { userId: session.user.id };
      }

      // Connect after a short delay
      setTimeout(() => {
        socket.connect();
      }, 300);
    }
  }, [socket, session]);

  // Health check interval
  useEffect(() => {
    if (!socket) return;

    const interval = setInterval(() => {
      // Sync the connection state in case of inconsistency
      if (socket.connected !== isConnected) {
        console.log(`Socket connection state mismatch: socket.connected=${socket.connected}, state=${isConnected}`);
        setIsConnected(socket.connected);
      }

      // Attempt reconnection if needed
      if (!socket.connected && connectionStatus !== 'connecting') {
        console.log('Health check: Socket disconnected, attempting to reconnect');
        reconnect();
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [socket, isConnected, connectionStatus, reconnect]);

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