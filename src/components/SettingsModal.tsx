import { useState } from 'react';
import { clearAllLocalData, isCloud } from '../lib/backend';
import { useStore } from '../store/AppStore';
import { Modal, Toggle } from './ui';

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {desc && <div className="text-xs text-muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsModal() {
  const { settingsOpen, openSettings, settings, updateSettings, sound, resetProgress, user } = useStore();
  const [confirm, setConfirm] = useState<null | 'reset' | 'wipe'>(null);

  return (
    <Modal open={settingsOpen} onClose={() => { openSettings(false); setConfirm(null); }} title="Settings">
      <div className="divide-y divide-line/70">
        <Row title="Theme" desc="Switch between dark and light mode">
          <div className="grid grid-cols-2 rounded-xl bg-surface2 p-1 text-sm font-semibold">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} onClick={() => updateSettings({ theme: t })} className={`rounded-lg px-3 py-1.5 transition ${settings.theme === t ? 'bg-surface shadow' : 'text-muted'}`}>
                {t === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            ))}
          </div>
        </Row>
        <Row title="Sound effects" desc="Game sounds and UI feedback">
          <Toggle label="Sound effects" checked={!settings.muted} onChange={(v) => { updateSettings({ muted: !v }); if (v) setTimeout(() => sound('click'), 0); }} />
        </Row>
        <Row title="Volume">
          <input
            type="range" min={0} max={1} step={0.05} value={settings.volume}
            disabled={settings.muted}
            onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
            onPointerUp={() => sound('point')}
            className="w-36 accent-[#a855f7]"
            aria-label="Volume"
          />
        </Row>
        <Row title="Reduce motion" desc="Minimise animations across the site">
          <Toggle label="Reduce motion" checked={settings.reducedMotion} onChange={(v) => updateSettings({ reducedMotion: v })} />
        </Row>
        <div className="py-4">
          <div className="mb-1 text-sm font-semibold">Data</div>
          <p className="mb-3 text-xs text-muted">
            {user ? (isCloud && user.provider === 'supabase' ? 'Your progress is synced to your cloud account.' : 'Your progress is saved to your account on this device.') : 'Playing as a guest — progress is saved in this browser. Create an account to keep it safe.'}
          </p>
          {confirm ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
              <p className="mb-3 text-sm">{confirm === 'reset' ? 'Reset all XP, coins, scores and achievements for this profile?' : 'Delete ALL NeonPlay data in this browser (guest, local accounts, settings)?'}</p>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" onClick={() => setConfirm(null)}>Cancel</button>
                <button
                  className="btn flex-1 bg-red-500 text-white hover:bg-red-600"
                  onClick={() => {
                    if (confirm === 'reset') resetProgress();
                    else {
                      clearAllLocalData();
                      window.location.reload();
                    }
                    setConfirm(null);
                  }}
                >
                  Yes, delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline" onClick={() => setConfirm('reset')}>Reset progress</button>
              <button className="btn-outline" onClick={() => setConfirm('wipe')}>Clear browser data</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
