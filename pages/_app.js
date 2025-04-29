import { SessionProvider } from "next-auth/react";
import { SocketProvider } from "../lib/socketContext";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <SessionProvider session={pageProps.session}>
      <SocketProvider>
        <Component {...pageProps} />
      </SocketProvider>
    </SessionProvider>
  );
}