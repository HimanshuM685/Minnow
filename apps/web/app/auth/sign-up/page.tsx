import { AuthForm } from '@/components/auth-form';
export default function SignUpPage() { return <main className="auth-page"><AuthForm mode="sign-up" google={process.env.NEON_AUTH_GOOGLE_ENABLED === 'true'} /></main>; }
