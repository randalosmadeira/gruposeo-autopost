import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { IndexationOverview, KeyReply } from '@/lib/indexation-api';
import { useT } from '@/lib/i18n/core';

interface Props { hosts: IndexationOverview['connections']['indexnow']['hosts']; canAdmin: boolean; busy: boolean; generated: KeyReply | null; onGenerate: (host: string) => void; onSave: (host: string, key: string) => Promise<boolean> }

/** Chave do IndexNow por site (qualquer país ou idioma): gerar, publicar o arquivo no site e cadastrar. Sem o arquivo no ar, o envio não acontece. */
export function IndexNowKeyPanel({ hosts, canAdmin, busy, generated, onGenerate, onSave }: Props) {
  const { t } = useT();
  const [host, setHost] = useState(hosts[0]?.host ?? '');
  const [key, setKey] = useState('');
  const current = host || hosts[0]?.host || '';
  return (
    <section aria-labelledby="ix-key" className="space-y-3 rounded-xl border bg-card/40 p-3 sm:p-5">
      <h2 id="ix-key" className="text-lg font-semibold">{t('key.title')}</h2>
      <p className="text-xs text-muted-foreground">{t('key.explain')}</p>
      {hosts.length === 0 ? <p className="text-sm text-muted-foreground">{t('key.none')}</p> : (
        <ul className="space-y-1 text-sm">{hosts.map((h) => <li key={h.host} className="break-all">{h.host}: <strong>{h.key_ready ? t('key.ready') : t('key.missing')}</strong></li>)}</ul>
      )}
      {!canAdmin && <p role="note" className="text-sm text-muted-foreground">{t('key.adminOnly')}</p>}
      {canAdmin && hosts.length > 0 && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await onSave(current, key.trim())) setKey(''); }}>
          <div><label htmlFor="key-host" className="block text-xs text-muted-foreground">{t('key.site')}</label>
            <select id="key-host" className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={current} onChange={(e) => setHost(e.target.value)}>{hosts.map((h) => <option key={h.host} value={h.host}>{h.host}</option>)}</select></div>
          <div><label htmlFor="key-value" className="block text-xs text-muted-foreground">{t('key.value')}</label>
            <input id="key-value" className="h-9 w-64 max-w-full rounded-md border bg-background px-2 text-sm" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" /></div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onGenerate(current)}>{t('key.generate')}</Button>
          <Button type="submit" size="sm" disabled={busy || !key.trim()}>{t('key.save')}</Button>
        </form>
      )}
      {generated?.key && (
        <div role="status" className="space-y-1 rounded border border-sky-500/50 bg-sky-500/10 p-3 text-sm">
          <p className="break-all">{t('key.suggested', { host: generated.host, key: generated.key })}</p>
          <p className="break-all text-xs">{t('key.howto', { file: generated.file_name ?? '', url: generated.file_url ?? '' })}</p>
        </div>
      )}
    </section>
  );
}
