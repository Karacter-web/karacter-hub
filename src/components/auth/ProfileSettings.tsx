'use client';

import { useState, type FormEvent } from 'react';
import { signOut } from 'next-auth/react';
import { LoaderCircle, LogOut, Save } from 'lucide-react';

interface ProfileSettingsProps {
  name: string;
  username: string;
  email: string;
  providers: string[];
}

const providerLabels: Record<string, string> = {
  credentials: 'Email and password',
  google: 'Google',
  github: 'GitHub',
};

export default function ProfileSettings({ name, username, email, providers }: ProfileSettingsProps) {
  const [displayName, setDisplayName] = useState(name);
  const [currentUsername, setCurrentUsername] = useState(username);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsSaving(true);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName, username: currentUsername }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Profile could not be updated.');
      setMessage('Profile saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Profile could not be updated.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-[760px]">
      <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
        <div><p className="font-mono text-[10px] uppercase text-muted">Your account</p><h1 className="mt-1 text-[25px] font-semibold">Profile settings</h1></div>
        <button onClick={() => void signOut({ redirectTo: '/' })} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[7px] border border-line-strong bg-white px-3 text-[11px] font-medium text-ink-soft hover:bg-surface-soft"><LogOut size={14} /> Sign out</button>
      </div>

      <form onSubmit={event => void saveProfile(event)} className="border-b border-line py-6">
        <h2 className="text-[14px] font-semibold">Profile</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-[11px] font-medium" htmlFor="display-name">Display name
            <input id="display-name" value={displayName} maxLength={80} required onChange={event => setDisplayName(event.target.value)} className="mt-1.5 h-10 w-full rounded-[7px] border border-line-strong bg-white px-3 text-[12px] outline-none focus:border-[#668a68]" />
          </label>
          <label className="text-[11px] font-medium" htmlFor="profile-username">Username
            <input id="profile-username" value={currentUsername} minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]{3,32}" required onChange={event => setCurrentUsername(event.target.value)} className="mt-1.5 h-10 w-full rounded-[7px] border border-line-strong bg-white px-3 text-[12px] outline-none focus:border-[#668a68]" />
          </label>
          <label className="text-[11px] font-medium sm:col-span-2" htmlFor="profile-email">Email
            <input id="profile-email" value={email || 'No email provided by identity provider'} readOnly className="mt-1.5 h-10 w-full rounded-[7px] border border-line bg-surface-soft px-3 text-[12px] text-muted" />
            <span className="mt-1 block text-[10px] font-normal text-muted">Email changes require a verified address flow.</span>
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button disabled={isSaving} className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-brand px-3 text-[11px] font-semibold text-brand-deep hover:bg-brand-hover disabled:opacity-60">
            {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />} Save profile
          </button>
          {message && <p role="status" className="text-[11px] text-ink-soft">{message}</p>}
        </div>
      </form>

      <section className="border-b border-line py-6">
        <h2 className="text-[14px] font-semibold">Sign-in methods</h2>
        <p className="mt-1 text-[11px] text-muted">These providers authenticate your KaracterHub account.</p>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {providers.map(provider => (
            <li key={provider} className="flex items-center justify-between py-3 text-[12px]">
              <span>{providerLabels[provider] || provider}</span><span className="text-[10px] font-medium text-[#39734c]">Connected</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="py-6">
        <h2 className="text-[14px] font-semibold">GitHub repository access</h2>
        <p className="mt-1 max-w-[560px] text-[11px] leading-5 text-muted">Repository permissions are separate from GitHub sign-in. Connect a GitHub App here in a later setup step; signing in with GitHub does not grant repository access.</p>
        <div className="mt-3 inline-flex h-8 items-center rounded-[6px] border border-line bg-surface-soft px-2.5 text-[10px] text-muted">Not connected</div>
      </section>
    </div>
  );
}