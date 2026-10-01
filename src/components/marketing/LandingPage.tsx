import Link from 'next/link';
import { ArrowRight, Code2, Eye, Sparkles, WandSparkles } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-canvas text-ink">
      <header className="relative z-10 mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 sm:px-9">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-brand text-brand-deep"><Sparkles size={18} /></span>
          <span className="text-[15px] font-semibold">KaracterHub</span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Account navigation">
          <Link href="/login" className="hidden rounded-[8px] px-4 py-2.5 text-[12px] font-medium text-ink-soft hover:bg-surface sm:inline-flex">Sign in</Link>
          <Link href="/signup" className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-brand px-4 text-[12px] font-semibold text-brand-deep transition hover:bg-brand-hover">
            Start building <ArrowRight size={14} />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-[1240px] gap-12 px-5 pb-14 pt-12 sm:px-9 sm:pt-16 lg:min-h-[590px] lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-8 lg:pb-20 lg:pt-10">
        <div className="relative z-10 max-w-[600px] animate-enter">
          <p className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase text-ink-soft">
            <span className="grid size-6 place-items-center rounded-[6px] bg-mint text-brand-deep"><WandSparkles size={13} /></span>
            A workspace for your next idea
          </p>
          <h1 className="text-[46px] font-semibold leading-[1.04] sm:text-[58px] lg:text-[66px]">
            From first thought to <span className="relative inline-block">something real<span className="absolute -bottom-1 left-0 -z-10 h-[13px] w-full bg-brand/75" /></span>.
          </h1>
          <p className="mt-6 max-w-[500px] text-[15px] leading-7 text-ink-soft sm:text-[16px]">
            Describe the tool you need. KaracterHub builds a working starting point, runs it live, and gives you room to keep shaping it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-[8px] bg-brand px-5 text-[13px] font-semibold text-brand-deep shadow-[0_8px_24px_rgba(83,117,75,0.12)] transition hover:bg-brand-hover">
              Create your workspace <ArrowRight size={15} />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-[8px] px-4 text-[13px] font-medium text-ink-soft transition hover:bg-white/70">Sign in</Link>
          </div>
          <p className="mt-5 text-[10px] text-muted">Projects sync to your account. Start with a prompt, refine at your pace.</p>
        </div>

        <div className="relative mx-auto w-full max-w-[570px] animate-enter lg:ml-auto" style={{ animationDelay: '100ms' }}>
          <div className="absolute -inset-8 -z-10 bg-[linear-gradient(90deg,transparent_49px,#dfe7e1_50px,transparent_51px),linear-gradient(transparent_49px,#dfe7e1_50px,transparent_51px)] bg-[size:50px_50px] opacity-60" aria-hidden="true" />
          <div className="overflow-hidden rounded-[10px] border border-[#263b34] bg-[#111d1a] shadow-[0_24px_70px_rgba(28,53,39,0.2)]">
            <div className="flex h-10 items-center justify-between border-b border-white/10 bg-[#172622] px-4">
              <div className="flex items-center gap-2 text-[10px] text-[#d8e5db]"><span className="size-1.5 rounded-full bg-[#8ddc84]" /> A tiny team wiki</div>
              <span className="font-mono text-[9px] text-[#8ca59a]">PREVIEW · RUNNING</span>
            </div>
            <div className="grid min-h-[290px] grid-cols-[108px_1fr] sm:min-h-[330px] sm:grid-cols-[144px_1fr]">
              <div className="border-r border-white/10 bg-[#15231f] p-3 sm:p-4">
                <div className="mb-5 flex items-center gap-1.5 text-[9px] font-semibold text-[#d6e4da]"><Code2 size={12} /> FILES</div>
                <div className="space-y-2 font-mono text-[8px] text-[#9eb1a7] sm:text-[9px]">
                  <p className="text-[#d6e4da]">⌄ app</p><p className="pl-3">page.tsx</p><p className="pl-3">layout.tsx</p>
                  <p className="pt-1">⌄ components</p><p className="pl-3">Sidebar.tsx</p><p className="pl-3">Search.tsx</p>
                  <p className="pt-1">package.json</p>
                </div>
                <div className="mt-8 border-t border-white/10 pt-3 font-mono text-[8px] text-[#83c98d]">6 files ready</div>
              </div>
              <div className="bg-[#f5f7f3] p-4 sm:p-6">
                <div className="flex items-center justify-between border-b border-[#e1e8e1] pb-3">
                  <div><p className="text-[8px] uppercase text-[#829088]">Tuesday, October 1</p><p className="mt-1 text-[13px] font-semibold text-[#25372d] sm:text-[16px]">Team knowledge, together.</p></div>
                  <span className="grid size-7 place-items-center rounded-full bg-[#d9eddb] text-[9px] font-semibold text-[#3e7147]">AJ</span>
                </div>
                <div className="mt-4 flex h-8 items-center gap-2 rounded-[5px] border border-[#dce5dc] bg-white px-2.5 text-[9px] text-[#829088]"><span className="h-3 w-3 rounded-full border border-[#829088]" /> Search pages, people, and notes...</div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="min-h-[80px] border border-[#e1e8e1] bg-white p-2.5 sm:p-3"><p className="text-[8px] uppercase text-[#739079]">Getting started</p><p className="mt-2 text-[9px] font-semibold text-[#304239] sm:text-[11px]">How we work</p><p className="mt-1 text-[8px] text-[#849189]">5 pages · edited today</p></div>
                  <div className="min-h-[80px] border border-[#e1e8e1] bg-white p-2.5 sm:p-3"><p className="text-[8px] uppercase text-[#96764a]">Product</p><p className="mt-2 text-[9px] font-semibold text-[#304239] sm:text-[11px]">Roadmap notes</p><p className="mt-1 text-[8px] text-[#849189]">3 pages · edited yesterday</p></div>
                  <div className="col-span-2 flex items-center justify-between border border-[#e1e8e1] bg-white p-2.5 sm:p-3"><span className="text-[9px] font-medium text-[#304239]">A live app, not a static mockup</span><span className="flex items-center gap-1 text-[8px] text-[#527d58]"><Eye size={11} /> Preview</span></div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 bg-[#172622] px-4 py-2.5 text-[9px] text-[#a7bbb0]"><Sparkles size={12} className="text-[#c3f56b]" /> Generated from one prompt, ready for your next change.</div>
          </div>
          <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-[7px] border border-line bg-white px-3 py-2 text-[10px] font-medium shadow-[0_8px_24px_rgba(29,49,37,0.1)] sm:flex"><span className="size-1.5 rounded-full bg-[#59ad70]" /> Saved to your workspace</div>
        </div>
      </section>

      <section className="border-y border-line bg-[#eaf0ea]">
        <div className="mx-auto grid max-w-[1240px] gap-6 px-5 py-7 sm:grid-cols-3 sm:px-9 sm:py-8">
          <div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-white text-brand-deep"><Sparkles size={15} /></span><div><h2 className="text-[12px] font-semibold">A useful first draft</h2><p className="mt-1 text-[10px] leading-5 text-muted">Turn product intent into files you can inspect and change.</p></div></div>
          <div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-white text-brand-deep"><Eye size={15} /></span><div><h2 className="text-[12px] font-semibold">A real runtime</h2><p className="mt-1 text-[10px] leading-5 text-muted">Run the generated project in an isolated browser preview.</p></div></div>
          <div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-[7px] bg-white text-brand-deep"><FaGithub size={15} /></span><div><h2 className="text-[12px] font-semibold">Your work, in your account</h2><p className="mt-1 text-[10px] leading-5 text-muted">Save projects privately and connect GitHub when you choose.</p></div></div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 text-[10px] text-muted sm:px-9">
        <span>KaracterHub · Ideas into working software.</span>
        <Link href="/signup" className="inline-flex items-center gap-1.5 font-medium text-ink-soft hover:text-ink">Build something <ArrowRight size={12} /></Link>
      </footer>
    </main>
  );
}