import { getSession } from 'next-auth/react';

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) {
    return { redirect: { destination: '/auth/signin', permanent: false } };
  }
  return { redirect: { destination: '/lobby', permanent: false } };
}

export default function Home() {
  return null;
}
