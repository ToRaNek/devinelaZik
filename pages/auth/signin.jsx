"use client";
import { getProviders, signIn } from "next-auth/react";

export default function SignIn({ providers }) {
  const signInProviders = Object.values(providers).filter(p =>
    p.id === 'google' || p.id === 'discord'
  );
  return (
    <div style={{ padding: 20 }}>
      <h1>Connectez-vous</h1>
      {signInProviders.map(provider => (
        <div key={provider.name} style={{ margin: '1rem 0' }}>
          <button onClick={() => signIn(provider.id, { callbackUrl: '/' })}>
            Se connecter avec {provider.name}
          </button>
        </div>
      ))}
    </div>
  );
}

export async function getServerSideProps(context) {
  const providers = await getProviders();
  return { props: { providers: providers ?? {} } };
}
