import Link from 'next/link';
import { ArrowLeft, MailCheck } from 'lucide-react';

export default function VerifyEmailPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-5 text-ink">
      <section className="w-full max-w-[440px] border-y border-line py-10 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[10px] bg-mint text-brand-deep"><MailCheck size={22} /></span>
        <p className="mt-5 font-mono text-[10px] uppercase text-muted">Check your inbox</p>
        <h1 className="mt-2 text-[25px] font-semibold">Your sign-in link is on its way.</h1>
        <p className="mx-auto mt-3 max-w-[340px] text-[12px] leading-6 text-ink-soft">Open the email from KaracterHub to verify your address and finish signing in. The link expires after 24 hours.</p>
        <Link href="/login" className="mx-auto mt-6 inline-flex h-10 items-center gap-2 rounded-[7px] border border-line-strong bg-white px-3 text-[11px] font-medium text-ink-soft hover:bg-surface-soft"><ArrowLeft size={13} /> Back to sign in</Link>
      </section>
    </main>
  );
}