#!/usr/bin/env python3
"""Zica Signals - leitor de access log (nginx/Apache, formato combined).

Agrega por dia x tipo x agente x caminho (sem query string), assina cada lote com HMAC-SHA256
e envia ao endpoint zica-signals. Nao envia IP, User-Agent completo nem cookies.
So biblioteca padrao (Python 3.8+).

Exemplo:
  export ZICA_SIGNALS_SECRET='COLE_AQUI'          # nunca na linha de comando
  python3 zica_signals_shipper.py --log /var/log/nginx/access.log --site-id COLE_AQUI_O_SITE_ID \
      --site-host meusite.com.br --endpoint https://COLE_AQUI.supabase.co/functions/v1/zica-signals \
      --state /var/lib/zica-signals/state.json

  --dry-run imprime o lote que seria enviado (sem assinatura e sem rede).
Assinatura igual ao plugin: hex(hmac_sha256(secret, ts + "\\n" + nonce + "\\n" + sha256hex(body))).
"""
import argparse
import gzip
import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

# BEGIN signals-catalog (gerado de signals-catalog.json - nao editar a mao)
CATALOG = json.loads(r'''{"b":["meta-externalagent","Applebot-Extended","Claude-SearchBot","Perplexity-User","Google-Extended","Googlebot-Image","Googlebot-Video","OAI-SearchBot","PerplexityBot","DuckAssistBot","ChatGPT-User","anthropic-ai","Claude-User","Bytespider","ClaudeBot","Googlebot","cohere-ai","Amazonbot","Applebot","Bingbot","GPTBot","CCBot"],"a":[["chatgpt.com",["chatgpt.com","chat.openai.com","openai.com"]],["perplexity.ai",["perplexity.ai"]],["gemini.google.com",["gemini.google.com","bard.google.com"]],["copilot.microsoft.com",["copilot.microsoft.com"]],["claude.ai",["claude.ai"]],["you.com",["you.com"]],["poe.com",["poe.com"]],["meta.ai",["meta.ai"]],["grok.com",["grok.com","x.ai"]]],"c":[["duckduckgo.com","duckduckgo.com",{"ia":"chat"},null],["bing.com","copilot.microsoft.com",null,["/chat","/copilot"]]],"u":{"chatgpt.com":"chatgpt.com","perplexity":"perplexity.ai","gemini":"gemini.google.com","copilot":"copilot.microsoft.com","claude":"claude.ai"},"s":[["google","(^|\\.)google\\.[a-z.]{2,6}$"],["bing","(^|\\.)bing\\.com$"],["duckduckgo","(^|\\.)duckduckgo\\.com$"],["yahoo","(^|\\.)yahoo\\.[a-z.]{2,6}$"],["yandex","(^|\\.)yandex\\.[a-z.]{2,6}$"],["ecosia","(^|\\.)ecosia\\.org$"],["baidu","(^|\\.)baidu\\.com$"]]}''')
# END signals-catalog

BATCH_MAX_EVENTS = 500
MAX_KEYS = 20000

LOG_RE = re.compile(
    r'^\S+ \S+ \S+ \[(?P<time>[^\]]+)\] "(?P<method>[A-Z]+) (?P<target>\S+)[^"]*" (?P<status>\d{3}) \S+'
    r'(?: "(?P<referer>[^"]*)" "(?P<ua>[^"]*)")?'
)
MONTHS = {m: i for i, m in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], start=1)}

BOTS = [(name, name.lower()) for name in CATALOG.get('b', [])]


def host_is(host, hosts):
    return any(host == h or host.endswith('.' + h) for h in hosts)


def detect_bot(ua):
    low = (ua or '').lower()
    for name, lname in BOTS:
        if lname in low:
            return name
    return None


def classify_referrer(referer, target, own_host):
    parsed_target = urllib.parse.urlsplit(target)
    qs = urllib.parse.parse_qs(parsed_target.query)
    utm = ((qs.get('utm_source') or qs.get('ref') or [''])[0]).lower()
    if utm and utm in CATALOG.get('u', {}):
        return 'ai_referral', CATALOG['u'][utm]
    if not referer or referer == '-':
        return None
    try:
        r = urllib.parse.urlsplit(referer)
    except ValueError:
        return None
    host = (r.hostname or '').lower()
    host = host[4:] if host.startswith('www.') else host
    own = (own_host or '').lower()
    own = own[4:] if own.startswith('www.') else own
    if not host or host == own:
        return None
    for agent, hosts in CATALOG.get('a', []):
        if host_is(host, hosts):
            return 'ai_referral', agent
    rq = urllib.parse.parse_qs(r.query)
    for h, agent, query, prefixes in CATALOG.get('c', []):
        if not host_is(host, [h]):
            continue
        if query and any((rq.get(k) or [None])[0] == v for k, v in query.items()):
            return 'ai_referral', agent
        if prefixes and any((r.path or '/').startswith(p) for p in prefixes):
            return 'ai_referral', agent
    for agent, pattern in CATALOG.get('s', []):
        if re.search(pattern, host, re.IGNORECASE):
            return 'search_referral', agent
    return None


def parse_day(raw, tz):
    """'12/Nov/2026:10:11:12 -0300' -> 'YYYY-MM-DD' no fuso pedido (ou no fuso do proprio log)."""
    try:
        date_part, zone = raw.split(' ')
        d, mon, rest = date_part.split('/')
        y, hh, mm, ss = rest.split(':')
        sign = -1 if zone.startswith('-') else 1
        offset = timezone(sign * timedelta(hours=int(zone[1:3]), minutes=int(zone[3:5])))
        dt = datetime(int(y), MONTHS[mon], int(d), int(hh), int(mm), int(ss), tzinfo=offset)
    except (ValueError, KeyError):
        return None
    if tz:
        try:
            from zoneinfo import ZoneInfo
            dt = dt.astimezone(ZoneInfo(tz))
        except Exception:  # sem tzdata: usa o fuso do proprio log
            pass
    return dt.strftime('%Y-%m-%d')


def open_log(path, offset):
    if path.endswith('.gz'):
        return gzip.open(path, 'rt', encoding='utf-8', errors='replace'), 0
    f = open(path, 'r', encoding='utf-8', errors='replace')
    size = os.path.getsize(path)
    if offset and size >= offset:
        f.seek(offset)
    return f, size


def aggregate(paths, state, args):
    counts = OrderedDict()
    new_state = dict(state)
    for path in paths:
        if args.state and path.endswith('.gz') and path in state:
            continue  # log rotacionado ja lido
        offset = int(state.get(path, 0)) if args.state else 0
        fh, size = open_log(path, offset)
        with fh:
            for line in fh:
                m = LOG_RE.match(line)
                if not m or m.group('method') not in ('GET', 'HEAD'):
                    continue
                hit = detect_bot(m.group('ua'))
                kind = 'ai_bot_hit' if hit else None
                if hit is None and args.referrals:
                    cls = classify_referrer(m.group('referer'), m.group('target'), args.site_host)
                    if cls:
                        kind, hit = cls
                if not hit:
                    continue
                day = parse_day(m.group('time'), args.tz)
                if not day:
                    continue
                clean = re.sub(r'[^\x20-\x7E]', '', urllib.parse.urlsplit(m.group('target')).path or '/')
                clean = (clean.replace('|', '%7C') or '/')[:200]
                key = (day, kind, hit, clean)
                if key in counts:
                    counts[key] = min(100000, counts[key] + 1)
                elif len(counts) < MAX_KEYS:
                    counts[key] = 1
        new_state[path] = size or 1
    return counts, new_state


def build_batches(counts, site_host):
    events = [{'day': d, 'kind': k, 'agent': a, 'path': p, 'hits': h} for (d, k, a, p), h in counts.items()]
    for i in range(0, len(events), BATCH_MAX_EVENTS):
        yield json.dumps({'site_host': site_host, 'batch_id': str(uuid.uuid4()), 'events': events[i:i + BATCH_MAX_EVENTS]},
                         separators=(',', ':'), ensure_ascii=False)


def sign(secret, ts, nonce, body):
    body_hash = hashlib.sha256(body.encode('utf-8')).hexdigest()
    return hmac.new(secret.encode('utf-8'), '{}\n{}\n{}'.format(ts, nonce, body_hash).encode('utf-8'), hashlib.sha256).hexdigest()


def send(endpoint, site_id, secret, body):
    ts = str(int(time.time()))
    nonce = str(uuid.uuid4())
    req = urllib.request.Request(endpoint, data=body.encode('utf-8'), method='POST', headers={
        'Content-Type': 'application/json',
        'X-Zica-Site': site_id,
        'X-Zica-Timestamp': ts,
        'X-Zica-Nonce': nonce,
        'X-Zica-Signature': sign(secret, ts, nonce, body),
        'User-Agent': 'zica-signals-shipper/1.0',
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status


def main(argv=None):
    p = argparse.ArgumentParser(description='Envia sinais de robos de IA lidos do access log ao Zica.ai.')
    p.add_argument('--log', action='append', required=True, help='arquivo de log (repita para varios; aceita .gz)')
    p.add_argument('--site-id', default=os.environ.get('ZICA_SIGNALS_SITE_ID', ''))
    p.add_argument('--site-host', required=True, help='dominio do site, ex.: meusite.com.br')
    p.add_argument('--endpoint', default=os.environ.get('ZICA_SIGNALS_ENDPOINT', ''))
    p.add_argument('--secret-env', default='ZICA_SIGNALS_SECRET', help='variavel de ambiente com o segredo')
    p.add_argument('--tz', default='America/Sao_Paulo', help='fuso do campo dia')
    p.add_argument('--state', help='arquivo JSON para lembrar ate onde cada log foi lido')
    p.add_argument('--referrals', action='store_true', help='tambem conta visitas vindas de IA/busca (nao use junto com o snippet)')
    p.add_argument('--dry-run', action='store_true', help='imprime o lote e nao envia')
    args = p.parse_args(argv)
    args.site_host = args.site_host.lower()

    state = {}
    if args.state and os.path.exists(args.state):
        try:
            with open(args.state, 'r', encoding='utf-8') as fh:
                state = json.load(fh)
        except (OSError, ValueError):
            state = {}

    counts, new_state = aggregate(args.log, state, args)
    batches = list(build_batches(counts, args.site_host))
    if args.dry_run:
        for b in batches:
            print(b)
        print('# dry-run: {} chaves, {} lote(s); nada foi enviado'.format(len(counts), len(batches)), file=sys.stderr)
        return 0
    if not batches:
        print('Nada a enviar.', file=sys.stderr)
        return 0

    secret = os.environ.get(args.secret_env, '')
    if not (args.site_id and args.endpoint and secret):
        print('Faltam --site-id, --endpoint ou a variavel {}.'.format(args.secret_env), file=sys.stderr)
        return 2
    if urllib.parse.urlsplit(args.endpoint).scheme != 'https':
        print('O endpoint precisa ser https.', file=sys.stderr)
        return 2
    for b in batches:
        try:
            status = send(args.endpoint, args.site_id, secret, b)
        except urllib.error.HTTPError as e:
            print('Lote recusado: HTTP {}'.format(e.code), file=sys.stderr)
            return 1
        except (urllib.error.URLError, OSError) as e:
            print('Falha de rede: {}'.format(e), file=sys.stderr)
            return 1
        if not 200 <= status < 300:
            print('Lote recusado: HTTP {}'.format(status), file=sys.stderr)
            return 1
    if args.state:
        os.makedirs(os.path.dirname(os.path.abspath(args.state)), exist_ok=True)
        with open(args.state, 'w', encoding='utf-8') as fh:
            json.dump(new_state, fh)
    print('Enviado: {} chaves em {} lote(s).'.format(len(counts), len(batches)), file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
