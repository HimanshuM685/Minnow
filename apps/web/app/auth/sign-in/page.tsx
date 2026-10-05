import { AuthForm } from '@/components/auth-form';
export default function SignInPage() { return <main className="auth-page"><AuthForm mode="sign-in" google={process.env.NEON_AUTH_GOOGLE_ENABLED === 'true'} /></main>; }
