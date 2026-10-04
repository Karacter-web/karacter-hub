'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';

interface AuthFormProps {
  mode: 'login' | 'signup';
  callbackUrl: string;
  googleEnabled: boolean;
  githubEnabled: boolean;
  emailEnabled: boolean;
  databaseEnabled: boolean;
  authConfigured: boolean;
  initialError?: string;
}

export default function AuthForm({
  mode,
  callbackUrl,
  googleEnabled,
  githubEnabled,
  emailEnabled,
  databaseEnabled,
  authConfigured,
  initialError = '',
}: AuthFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const credentialsEnabled = authConfigured && databaseEnabled && (mode === 'login' || emailEnabled);

  async function handleCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'signup') {
        if (password !== passwordConfirmation) {
          setError('Passwords do not match.');
          return;
        }

        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) {
          setError(result.error || 'Unable to create your account.');
          return;
        }

        try {
          await signIn('resend', { email: email.trim().toLowerCase(), redirectTo: callbackUrl });
        } catch {
          setError('Your account was created, but the verification email could not be sent. Use "Email me a sign-in link" on the sign-in page.');
        }
        return;
      }

      const result = await signIn('credentials', {
        identifier,
        password,
        redirect: false,
        redirectTo: callbackUrl,
      });

      if (!result || result.error) {
        setError('Those sign-in details were not accepted.');
        return;
      }

      router.replace(result.url || callbackUrl);
      router.refresh();
    } catch {
      setError('Authentication is temporarily unavailable. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendEmailLink() {
    setError('');
    setNotice('');
    if (!authConfigured || !emailEnabled || !identifier.includes('@')) {
      setError('Enter your account email address to receive a sign-in link.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signIn('resend', { email: identifier.trim().toLowerCase(), redirectTo: callbackUrl });
    } catch {
      setError('A sign-in link could not be sent. Please try again.');
      setIsSubmitting(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    if (!authConfigured) return;
    setError('');
    setIsSubmitting(true);
    try {
      await signIn(provider, { redirectTo: callbackUrl });
    } catch {
      setError('The identity provider could not start sign-in. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      {!authConfigured && (
        <p role="status" className="mb-4 rounded-[7px] border border-[#e5c6b9] bg-[#fff8f4] px-3 py-2.5 text-[12px] leading-5 text-[#8c4938]">
          Sign-in is temporarily unavailable while the server finishes its authentication setup.
        </p>
      )}

      <div className={`grid gap-2 ${googleEnabled ? 'sm:grid-cols-2' : ''}`}>
        {googleEnabled && (
          <button
            type="button"
            onClick={() => void handleOAuth('google')}
            disabled={isSubmitting || !authConfigured}
            className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-line-strong bg-white text-[13px] font-medium transition hover:bg-surface-soft disabled:opacity-60"
          >
            <span aria-hidden="true" className="font-bold text-[#4285f4]">G</span> Google
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleOAuth('github')}
          disabled={isSubmitting || !authConfigured || !githubEnabled}
          title={githubEnabled ? undefined : 'GitHub sign-in has not been configured yet.'}
          className="flex h-11 items-center justify-center gap-2 rounded-[8px] border border-line-strong bg-white text-[13px] font-medium transition hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FaGithub size={15} /> {mode === 'signup' ? 'Sign up with GitHub' : 'Continue with GitHub'}
        </button>
      </div>
      {!githubEnabled && (
        <p className="mt-2 text-[10px] text-muted">GitHub sign-in is coming soon for this workspace.</p>
      )}

      <div className="my-5 flex items-center gap-3 text-[10px] uppercase text-muted">
        <span className="h-px flex-1 bg-line" />
        <span>or use email</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {error && !credentialsEnabled && <p role="alert" className="mb-4 rounded-[7px] border border-[#e5c6b9] bg-[#fff8f4] px-3 py-2.5 text-[12px] text-[#8c4938]">{error}</p>}

      {credentialsEnabled ? <form className="space-y-4" onSubmit={event => void handleCredentials(event)}>
        {mode === 'signup' ? (
          <>
            <label className="block text-[12px] font-medium" htmlFor="username">
              Username
              <input
                id="username"
                name="username"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]{3,32}"
                required
                value={username}
                onChange={event => setUsername(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-[8px] border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-[#668a68]"
              />
              <span className="mt-1 block text-[10px] font-normal text-muted">3-32 letters, numbers, or underscores.</span>
            </label>
            <label className="block text-[12px] font-medium" htmlFor="email">
              Email
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="mt-1.5 h-11 w-full rounded-[8px] border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-[#668a68]"
              />
            </label>
          </>
        ) : (
          <label className="block text-[12px] font-medium" htmlFor="identifier">
            Email or username
            <input
              id="identifier"
              name="identifier"
              autoComplete="username"
              required
              value={identifier}
              onChange={event => setIdentifier(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-[8px] border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-[#668a68]"
            />
          </label>
        )}

        <label className="block text-[12px] font-medium" htmlFor="password">
          Password
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={mode === 'signup' ? 12 : undefined}
            maxLength={72}
            required
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-[8px] border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-[#668a68]"
          />
          {mode === 'signup' && <span className="mt-1 block text-[10px] font-normal text-muted">Use at least 12 characters.</span>}
        </label>

        {mode === 'signup' && (
          <label className="block text-[12px] font-medium" htmlFor="password-confirmation">
            Confirm password
            <input
              id="password-confirmation"
              name="password-confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
              value={passwordConfirmation}
              onChange={event => setPasswordConfirmation(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-[8px] border border-line-strong bg-white px-3 text-[13px] outline-none focus:border-[#668a68]"
            />
          </label>
        )}

        {error && <p role="alert" className="rounded-[7px] border border-[#e5c6b9] bg-[#fff8f4] px-3 py-2.5 text-[12px] text-[#8c4938]">{error}</p>}
        {notice && <p role="status" className="rounded-[7px] border border-line bg-surface-soft px-3 py-2.5 text-[12px] text-ink-soft">{notice}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-brand-deep transition hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
        >
          {isSubmitting && <LoaderCircle size={15} className="animate-spin" />}
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        {mode === 'login' && emailEnabled && (
          <button type="button" onClick={() => void sendEmailLink()} disabled={isSubmitting} className="w-full py-1 text-[11px] font-medium text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink disabled:opacity-60">
            Email me a sign-in link
          </button>
        )}
      </form> : (
        <p role="status" className="rounded-[7px] border border-line bg-surface-soft px-3 py-3 text-[12px] leading-5 text-ink-soft">
          {!authConfigured
            ? 'Email and password sign-in will be available once authentication setup is complete.'
            : databaseEnabled
              ? 'Password account creation is unavailable until email verification is configured.'
              : 'Sign-in is not available until database configuration is complete.'}
        </p>
      )}
    </div>
  );
}