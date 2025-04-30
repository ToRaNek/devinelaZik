// pages/socket-test.js
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export default function SocketTest() {
    const [logs, setLogs] = useState([]);
    const [socketId, setSocketId] = useState(null);

    useEffect(() => {
        const addLog = (message) => {
            setLogs(prev => [...prev, `${new Date().toISOString().substr(11, 8)} - ${message}`]);
        };

        const init = async () => {
            try {
                addLog("Initializing server...");
                // Assurez-vous que le serveur Socket.IO est initialisé
                await fetch('/api/socketio');
                addLog("Creating socket...");

                const socket = io({
                    path: '/socket.io', // Utilisez le même chemin que sur le serveur
                    transports: ['websocket', 'polling'],
                    autoConnect: true
                });

                socket.on('connect', () => {
                    addLog(`Connected with ID: ${socket.id}`);
                    setSocketId(socket.id);
                });

                socket.on('disconnect', (reason) => {
                    addLog(`Disconnected: ${reason}`);
                    setSocketId(null);
                });

                socket.on('connect_error', (error) => {
                    addLog(`Connection error: ${error.message}`);
                });

                socket.on('serverAck', (data) => {
                    addLog(`Server ack: ${JSON.stringify(data)}`);
                });

                // Nouveaux événements pour le diagnostic
                socket.io.on('reconnect_attempt', (attempt) => {
                    addLog(`Reconnection attempt #${attempt}`);
                });

                socket.io.on('reconnect', (attemptNumber) => {
                    addLog(`Reconnected after ${attemptNumber} attempts`);
                });

                socket.io.on('error', (error) => {
                    addLog(`Socket.IO error: ${error}`);
                });

                // Cleanup
                return () => {
                    socket.disconnect();
                };
            } catch (error) {
                addLog(`Error: ${error.message}`);
            }
        };

        init();
    }, []);

    return (
        <div>
            <h1>Socket.IO Test</h1>
            <div>Status: {socketId ? `Connected (${socketId})` : 'Disconnected'}</div>
            <div style={{marginTop: '20px'}}>
                <h3>Logs:</h3>
                <div style={{height: '400px', overflow: 'auto', border: '1px solid #ccc', padding: '10px'}}>
                    {logs.map((log, i) => <div key={i}>{log}</div>)}
                </div>
            </div>
        </div>
    );
}