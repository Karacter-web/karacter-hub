'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Database, LoaderCircle, PlugZap, RotateCcw, Upload } from 'lucide-react';

interface ProjectOption {
  id: string;
  name: string;
}

interface DatabaseSettingsPanelProps {
  projects: ProjectOption[];
  initialProjectId: string;
}

interface DatabaseSettings {
  provider: 'netlify' | 'neon';
  neonProjectId?: string;
  hasConnectionString: boolean;
  hasApiKey: boolean;
}

interface MigrationPreview {
  name: string;
  sql: string;
  status: 'pending' | 'applied' | 'modified';
}

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

export default function DatabaseSettingsPanel({ projects, initialProjectId }: DatabaseSettingsPanelProps) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [settings, setSettings] = useState<DatabaseSettings | null>(null);
  const [connectionString, setConnectionString] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [neonProjectId, setNeonProjectId] = useState('');
  const [databaseName, setDatabaseName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showMigrationReview, setShowMigrationReview] = useState(false);
  const [preview, setPreview] = useState<MigrationPreview[]>([]);
  const [confirmedExternalWrite, setConfirmedExternalWrite] = useState(false);

  const baseUrl = `/api/projects/${encodeURIComponent(projectId)}/database`;

  const loadSettings = useCallback(async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}/database`, { cache: 'no-store' });
      const result = await readJson<DatabaseSettings & { error?: string }>(response);
      if (!response.ok) throw new Error(result.error || 'Database settings are unavailable.');
      setSettings(result);
      setNeonProjectId(result.neonProjectId ?? '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Database settings are unavailable.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings(projectId);
  }, [loadSettings, projectId]);

  async function saveAndTest() {
    setIsSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'neon',
          connectionString,
          neonApiKey: apiKey || undefined,
          neonProjectId: neonProjectId || undefined,
          neonDatabaseName: databaseName || undefined,
        }),
      });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || 'Neon credentials could not be saved.');

      const health = await fetch(`${baseUrl}/health`, { cache: 'no-store' });
      const healthResult = await readJson<{ ok?: boolean; error?: string }>(health);
      if (!health.ok || !healthResult.ok) throw new Error('Connection saved, but the health check failed. Reconnect to update the credentials.');
      setStatus('Neon connection tested and saved.');
      setConnectionString('');
      setApiKey('');
      setShowForm(false);
      await loadSettings(projectId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Neon connection could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }

  async function testSavedConnection() {
    setIsSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: 'no-store' });
      const result = await readJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !result.ok) {
        if (result.error === 'reconnect_required') setShowForm(true);
        throw new Error('Reconnect required: Neon connection failed. Update the stored connection details.');
      }
      setStatus('Neon connection is healthy.');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Connection test failed.');
    } finally {
      setIsSaving(false);
    }
  }

  async function disconnectNeon() {
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(baseUrl, { method: 'DELETE' });
      const result = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error || 'Neon could not be disconnected.');
      setStatus('Switched back to Netlify Database. Your Neon database was not changed or deleted.');
      setShowForm(false);
      await loadSettings(projectId);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Neon could not be disconnected.');
    } finally {
      setIsSaving(false);
    }
  }

  async function reviewMigrations() {
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(`${baseUrl}/migrate`, { cache: 'no-store' });
      const result = await readJson<{ migrations?: MigrationPreview[]; error?: string; code?: string }>(response);
      if (!response.ok) {
        if (result.code === 'reconnect_required') setShowForm(true);
        throw new Error(result.code === 'reconnect_required' ? 'Reconnect required to preview migrations.' : result.error || 'Migration preview is unavailable.');
      }
      setPreview(result.migrations ?? []);
      setConfirmedExternalWrite(false);
      setShowMigrationReview(true);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Migration preview is unavailable.');
    } finally {
      setIsSaving(false);
    }
  }

  async function pushSchema() {
    setIsSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`${baseUrl}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const result = await readJson<{ applied?: string[]; skipped?: string[]; error?: string; message?: string; statementIndex?: number | null }>(response);
      if (!response.ok) {
        if (result.error === 'reconnect_required') setShowForm(true);
        const failingStatement = result.statementIndex ? ` Statement ${result.statementIndex} failed.` : '';
        throw new Error(`${result.message || result.error || 'Schema push failed.'}${failingStatement}`);
      }
      setStatus(`Schema push complete: ${result.applied?.length ?? 0} applied, ${result.skipped?.length ?? 0} already current.`);
      setShowMigrationReview(false);
      await reviewMigrations();
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : 'Schema push failed.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!projects.length) {
    return <p className="border-y border-line py-6 text-[12px] text-muted">Save a project to configure its database.</p>;
  }

  const pendingCount = preview.filter(migration => migration.status === 'pending').length;
  const modifiedCount = preview.filter(migration => migration.status === 'modified').length;

  return (
    <div className="max-w-[760px]">
      <div className="border-b border-line pb-5">
        <p className="font-mono text-[10px] uppercase text-muted">Project infrastructure</p>
        <h1 className="mt-1 text-[25px] font-semibold">Database</h1>
        <p className="mt-2 max-w-[600px] text-[12px] leading-5 text-ink-soft">Each project uses Netlify Database unless you explicitly connect a Neon database.</p>
      </div>

      <label htmlFor="database-project" className="mt-5 block max-w-[430px] text-[11px] font-medium">Project
        <select id="database-project" value={projectId} onChange={event => { setSettings(null); setShowForm(false); setProjectId(event.target.value); }} className="mt-1.5 h-10 w-full rounded-[7px] border border-line-strong bg-white px-3 text-[12px] outline-none focus:border-[#668a68]">
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>

      <section className="mt-6 border-y border-line py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-[7px] bg-mint text-brand-deep"><Database size={17} /></span>
            <div>
              <h2 className="text-[13px] font-semibold">{settings?.provider === 'neon' ? 'Neon PostgreSQL' : 'Netlify Database'}</h2>
              <p className="mt-1 text-[10px] leading-5 text-muted">{settings?.provider === 'neon' ? 'External database selected for this project.' : 'Managed by Netlify. Migrations apply on deploy.'}</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-[5px] px-2 py-1 text-[9px] font-semibold ${settings?.provider === 'neon' ? 'bg-[#e8efff] text-[#365d9a]' : 'bg-mint text-brand-deep'}`}>
            {isLoading ? 'Loading' : settings?.provider === 'neon' ? 'BYO Neon' : 'Managed by Netlify'}
          </span>
        </div>

        {settings?.provider !== 'neon' || showForm ? (
          <div className="mt-4">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="h-9 rounded-[7px] border border-line-strong bg-white px-3 text-[11px] font-medium text-ink-soft hover:bg-surface-soft">Bring your own Neon</button>
            ) : (
              <div className="mt-4 max-w-[580px] space-y-3 border-l-2 border-[#b8caad] pl-4">
                <label className="block text-[11px] font-medium" htmlFor="neon-connection-string">Neon connection string
                  <textarea id="neon-connection-string" value={connectionString} onChange={event => setConnectionString(event.target.value)} rows={3} autoComplete="off" spellCheck={false} placeholder="postgresql://user:password@ep-example.region.aws.neon.tech/database?sslmode=require" className="mt-1.5 w-full resize-y rounded-[7px] border border-line-strong bg-white px-3 py-2.5 font-mono text-[10px] outline-none focus:border-[#668a68]" />
                </label>
                <label className="block text-[11px] font-medium" htmlFor="neon-api-key">Neon API key <span className="font-normal text-muted">(optional, encrypted)</span>
                  <input id="neon-api-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" className="mt-1.5 h-10 w-full rounded-[7px] border border-line-strong bg-white px-3 text-[11px] outline-none focus:border-[#668a68]" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-[11px] font-medium" htmlFor="neon-project-id">Neon project ID <span className="font-normal text-muted">(optional)</span>
                    <input id="neon-project-id" value={neonProjectId} onChange={event => setNeonProjectId(event.target.value)} className="mt-1.5 h-9 w-full rounded-[7px] border border-line-strong bg-white px-3 text-[11px] outline-none focus:border-[#668a68]" />
                  </label>
                  <label className="block text-[11px] font-medium" htmlFor="neon-database-name">Database name <span className="font-normal text-muted">(optional)</span>
                    <input id="neon-database-name" value={databaseName} onChange={event => setDatabaseName(event.target.value)} className="mt-1.5 h-9 w-full rounded-[7px] border border-line-strong bg-white px-3 text-[11px] outline-none focus:border-[#668a68]" />
                  </label>
                </div>
                <p className="text-[10px] leading-5 text-muted">Credentials are encrypted before storage and never returned to the browser. Schema changes are only sent to Neon after you review and confirm them.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button disabled={isSaving || !connectionString.trim()} onClick={() => void saveAndTest()} className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-brand px-3 text-[11px] font-semibold text-brand-deep hover:bg-brand-hover disabled:opacity-50">
                    {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <PlugZap size={13} />} Test and save
                  </button>
                  <button disabled={isSaving} onClick={() => setShowForm(false)} className="h-9 rounded-[7px] px-3 text-[11px] text-muted hover:bg-surface-soft">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ) : settings?.provider === 'neon' ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={isSaving} onClick={() => void testSavedConnection()} className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-line-strong bg-white px-3 text-[11px] font-medium text-ink-soft hover:bg-surface-soft disabled:opacity-50">
              {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />} Test connection
            </button>
            <button disabled={isSaving} onClick={() => { setShowForm(true); setConnectionString(''); }} className="h-9 rounded-[7px] border border-line-strong bg-white px-3 text-[11px] font-medium text-ink-soft hover:bg-surface-soft">Update credentials</button>
            <button disabled={isSaving} onClick={() => void disconnectNeon()} className="inline-flex h-9 items-center gap-2 rounded-[7px] px-3 text-[11px] text-muted hover:bg-surface-soft disabled:opacity-50"><RotateCcw size={13} /> Switch to Netlify</button>
          </div>
        ) : null}

        {settings?.provider === 'neon' && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-[12px] font-semibold">Schema migrations</h3><p className="mt-1 text-[10px] text-muted">External schema changes are never applied automatically.</p></div>
              <button disabled={isSaving} onClick={() => void reviewMigrations()} className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-[#213b30] px-3 text-[11px] font-semibold text-white hover:bg-[#315240] disabled:opacity-50">
                {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />} Review schema changes
              </button>
            </div>
          </div>
        )}
      </section>

      {status && <p role="status" className="mt-4 rounded-[7px] border border-[#d6e4d7] bg-[#f4faf4] px-3 py-2.5 text-[11px] text-[#3d6944]">{status}</p>}
      {error && <p role="alert" className="mt-4 rounded-[7px] border border-[#e5c6b9] bg-[#fff8f4] px-3 py-2.5 text-[11px] text-[#8c4938]">{error}</p>}

      {showMigrationReview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="migration-review-title" className="flex max-h-[88vh] w-full max-w-[820px] flex-col border border-line bg-white shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div><p className="font-mono text-[9px] uppercase text-muted">External database write</p><h2 id="migration-review-title" className="mt-1 text-[16px] font-semibold">Review schema changes</h2><p className="mt-1 text-[11px] text-ink-soft">This action writes SQL to your external Neon database. It cannot be automatically undone.</p></div>
              <button onClick={() => setShowMigrationReview(false)} aria-label="Close migration review" className="grid size-8 place-items-center rounded-[6px] text-muted hover:bg-surface-soft">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {preview.length === 0 ? <p className="text-[12px] text-muted">No Drizzle migration files are available in this project.</p> : preview.map(migration => (
                <article key={migration.name} className="mb-4 border border-line last:mb-0">
                  <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-soft px-3 py-2"><span className="font-mono text-[10px]">{migration.name}</span><span className={`text-[9px] font-semibold uppercase ${migration.status === 'modified' ? 'text-danger' : migration.status === 'applied' ? 'text-[#39734c]' : 'text-warning'}`}>{migration.status}</span></header>
                  <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-words bg-[#17221e] p-3 font-mono text-[9px] leading-4 text-[#dce8df]">{migration.sql}</pre>
                </article>
              ))}
              {modifiedCount > 0 && <p role="alert" className="mt-3 text-[11px] text-danger">An applied migration file changed. Restore the original migration before pushing new changes.</p>}
              {pendingCount === 0 && modifiedCount === 0 && preview.length > 0 && <p className="mt-3 text-[11px] text-[#39734c]">All listed migrations are already applied.</p>}
            </div>
            <div className="border-t border-line px-5 py-4">
              <label className="flex items-start gap-2.5 text-[11px] leading-5 text-ink-soft">
                <input type="checkbox" checked={confirmedExternalWrite} onChange={event => setConfirmedExternalWrite(event.target.checked)} className="mt-1 accent-[#466f4e]" />
                I understand this writes the pending SQL to my external Neon database.
              </label>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowMigrationReview(false)} className="h-9 rounded-[7px] border border-line-strong px-3 text-[11px] text-ink-soft hover:bg-surface-soft">Cancel</button>
                <button disabled={!confirmedExternalWrite || pendingCount === 0 || modifiedCount > 0 || isSaving} onClick={() => void pushSchema()} className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-[#213b30] px-3 text-[11px] font-semibold text-white hover:bg-[#315240] disabled:cursor-not-allowed disabled:opacity-45">
                  {isSaving ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />} Push schema
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {error.toLowerCase().includes('reconnect') && <div className="fixed bottom-4 right-4 z-40 flex items-center gap-3 border border-[#e6c2a3] bg-[#fff9f2] px-4 py-3 text-[11px] shadow-panel"><AlertTriangle size={15} className="text-warning" /> Connection needs attention <button onClick={() => setShowForm(true)} className="font-semibold underline">Reconnect</button></div>}
    </div>
  );
}