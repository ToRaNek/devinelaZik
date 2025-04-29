// pages/auth/signin.js
import { getProviders, signIn } from "next-auth/react";

export default function SignIn({ providers }) {
  return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">
            Welcome to DevineLaZik
          </h2>
          <div className="space-y-4">
            {Object.values(providers).map((provider) => (
                <button
                    key={provider.name}
                    onClick={() => signIn(provider.id)}
                    className={`w-full px-4 py-3 rounded-lg font-medium text-white transition-colors
                ${provider.id === 'google'
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-indigo-500 hover:bg-indigo-600'}`}
                >
                  <div className="flex items-center justify-center">
                    {provider.id === 'google' ? (
                        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                          {/* Google icon path */}
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                          {/* Discord icon path */}
                        </svg>
                    )}
                    Sign in with {provider.name}
                  </div>
                </button>
            ))}
          </div>
        </div>
      </div>
  );
}

export async function getServerSideProps() {
  const providers = await getProviders();
  return {
    props: { providers },
  };
}