import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import AuthForm from './AuthForm';

interface AuthPageProps {
  mode: 'login' | 'signup';
  callbackUrl: string;
  googleEnabled: boolean;
  githubEnabled: boolean;
  emailEnabled: boolean;
  databaseEnabled: boolean;
}

export default function AuthPage(props: AuthPageProps) {
  const isSignup = props.mode === 'signup';

  return (
    <main className="grid min-h-screen bg-canvas text-ink lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-line bg-[#e9f0e9] p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <Link href="/" className="flex w-fit items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-brand text-brand-deep"><Sparkles size={18} /></span>
          <span className="text-[15px] font-semibold">KaracterHub</span>
        </Link>
        <div className="relative z-10 max-w-[600px] pb-12">
          <p className="mb-5 font-mono text-[10px] uppercase text-ink-soft">Your idea, with room to grow</p>
          <h1 className="text-[54px] font-semibold leading-[1.02]">A clearer path from prompt to product.</h1>
          <p className="mt-6 max-w-[430px] text-[15px] leading-7 text-ink-soft">Build, run, and refine working software in a workspace that belongs to you.</p>
        </div>
        <div className="absolute -bottom-24 right-[-70px] size-[420px] rounded-full border border-[#cbd8ca]" aria-hidden="true" />
        <div className="absolute -bottom-8 right-[-12px] size-[300px] rounded-full border border-[#d5dfd4]" aria-hidden="true" />
        <p className="text-[11px] text-muted">KaracterHub · Make the idea tangible.</p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Back to KaracterHub home" className="grid size-9 place-items-center rounded-[8px] text-muted transition hover:bg-surface-soft hover:text-ink">
            <ArrowLeft size={17} />
          </Link>
          <Link href={isSignup ? '/login' : '/signup'} className="text-[12px] font-medium text-ink-soft hover:text-ink">
            {isSignup ? 'Already have an account?' : 'New to KaracterHub?'} <span className="text-[#466f4e]">{isSignup ? 'Sign in' : 'Create account'}</span>
          </Link>
        </div>

        <div className="my-auto flex justify-center py-12">
          <div className="w-full max-w-[420px]">
            <div className="mb-7 lg:hidden">
              <Link href="/" className="flex w-fit items-center gap-3">
                <span className="grid size-9 place-items-center rounded-[10px] bg-brand text-brand-deep"><Sparkles size={18} /></span>
                <span className="text-[15px] font-semibold">KaracterHub</span>
              </Link>
            </div>
            <p className="font-mono text-[10px] uppercase text-muted">{isSignup ? 'Get started' : 'Welcome back'}</p>
            <h2 className="mt-2 text-[30px] font-semibold">{isSignup ? 'Create your account' : 'Sign in to your workspace'}</h2>
            <p className="mt-2 mb-7 text-[13px] leading-6 text-ink-soft">
              {isSignup ? 'Keep your projects and return to them from any device.' : 'Your projects and workspace are ready when you are.'}
            </p>
            <AuthForm {...props} />
            <p className="mt-6 text-[10px] leading-5 text-muted">
              By continuing, you agree to use KaracterHub responsibly. Your generated projects remain private to your account.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}