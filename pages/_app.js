// pages/_app.js
import { SessionProvider } from "next-auth/react";
import { SocketProvider } from "../lib/socketContext";
import Header from "../components/Header";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
    return (
        <SessionProvider session={pageProps.session}>
            <SocketProvider>
                <Header />
                <main className="app-main">
                    <Component {...pageProps} />
                </main>
            </SocketProvider>
        </SessionProvider>
    );
}