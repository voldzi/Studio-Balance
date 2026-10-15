#!/usr/bin/env python3
"""Protect password-recovery URLs only on the Studio Balance identity host.

The existing site is patched in place. The shared hardener supplies its tested
snapshot/CAS, metadata-preserving backup, lock, validation/reload and rollback
transaction. Default execution is read-only; --apply is explicit.

Identity error logs are intentionally discarded: even severe Nginx errors may
contain the raw request URI. Sanitized access status/latency and Keycloak events
remain available. No query, referrer, credentials, cookies, IP or user agent is
included in the dedicated identity access format.
"""

import importlib.util
from pathlib import Path
import subprocess
import sys


spec = importlib.util.spec_from_file_location('studio_balance_recovery_base', Path(__file__).with_name('harden-studiobalance.py'))
base = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base
spec.loader.exec_module(base)

HOST = 'login.studio-balance.cz'
FORMAT_NAME = 'studiobalance_identity_safe'
FORMAT_BODY = '{"timestamp":"$time_iso8601","method":"$request_method","uri":"$uri","status":$status,"duration":$request_time,"requestId":"$request_id"}'
FORMAT = f"log_format {FORMAT_NAME} escape=json '{FORMAT_BODY}';"
ACCESS = ['/var/log/nginx/studiobalance-identity.access.log', FORMAT_NAME]
ERROR = ['/dev/null', 'crit']
REFERRER = ['Referrer-Policy', 'no-referrer', 'always']
RATE_KEY = '$studiobalance_identity_post_key'
RATE_ZONE = 'studiobalance_identity_posts'
RATE_LOCATION = '@studiobalance_identity_rate_limit'
RATE_MAP_ARGS = ['$request_method:$uri', RATE_KEY]
RATE_MAP_ROWS = [('default', ['']), ('~^POST:/realms/studio-balance/login-actions/', ['$binary_remote_addr'])]
RATE_MAP = 'map "$request_method:$uri" ' + RATE_KEY + ' {\n    default "";\n    ~^POST:/realms/studio-balance/login-actions/ $binary_remote_addr;\n}'
RATE_ZONE_ARGS = [RATE_KEY, 'zone=' + RATE_ZONE + ':1m', 'rate=10r/m']
RATE_ZONE_DIRECTIVE = 'limit_req_zone ' + ' '.join(RATE_ZONE_ARGS) + ';'
RATE_HTML = '<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chvilku prosím počkejte | Studio Balance</title><body><main><h1>Chvilku prosím počkejte</h1><p>Během krátké chvíle proběhlo více pokusů o přihlášení nebo obnovení hesla. Z bezpečnostních důvodů počkejte alespoň minutu. Potom se vraťte na předchozí stránku a zkuste to znovu.</p><p>Pokud si heslo nepamatujete, použijte možnost Zapomenuté heslo. Samotné čekání vaše heslo nezmění.</p><p><a href="https://studio-balance.cz/prihlaseni">Zpět na přihlášení</a></p></main></body></html>'
RATE_HANDLER_ROWS = [
    ('default_type', ['text/html']),
    ('add_header', ['Strict-Transport-Security', 'max-age=31536000', 'always']),
    ('add_header', ['X-Content-Type-Options', 'nosniff', 'always']),
    ('add_header', REFERRER),
    ('add_header', ['Retry-After', '60', 'always']),
    ('add_header', ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'always']),
    ('return', ['429', RATE_HTML]),
]
RATE_HANDLER = '\n'.join([
    '    location ' + RATE_LOCATION + ' {',
    '        default_type text/html;',
    '        add_header Strict-Transport-Security "max-age=31536000" always;',
    '        add_header X-Content-Type-Options nosniff always;',
    '        add_header Referrer-Policy no-referrer always;',
    '        add_header Retry-After 60 always;',
    '        add_header Content-Security-Policy "default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'none\'" always;',
    "        return 429 '" + RATE_HTML + "';",
    '    }', '',
])
RATE_DIRECTIVES = [
    ('limit_req', ['zone=' + RATE_ZONE, 'burst=20', 'nodelay']),
    ('limit_req_status', ['429']),
    ('limit_req_dry_run', ['off']),
    ('limit_req_log_level', ['notice']),
    ('error_page', ['429', '=', RATE_LOCATION]),
]


def named(server):
    return [item for item in base.select(server.children or [], 'server_name') if HOST in item.args]


def validate_locations(server):
    """Inherited safe logging/headers must not be overridden by a child."""
    for item in server.children or []:
        if item.name == 'include' and item.args != ['/etc/letsencrypt/options-ssl-nginx.conf']:
            raise base.HardeningError('Unfamiliar identity include could override recovery privacy.')
        if item.children is None:
            continue
        if item.name == 'location' and item.args == [RATE_LOCATION]:
            if [(child.name, child.args) for child in item.children] != RATE_HANDLER_ROWS or any(child.children is not None for child in item.children):
                raise base.HardeningError('The identity rate-limit response differs from the reviewed response.')
            continue
        if item.name != 'location' or item.args not in [['^~', '/realms/'], ['^~', '/resources/'], ['^~', '/admin/'], ['=', '/'], ['/']]:
            raise base.HardeningError('Unfamiliar identity child block.')
        for child in item.children:
            if child.children is not None or child.name in ('include', 'access_log', 'error_log', 'add_header', 'add_header_inherit', 'proxy_hide_header', 'proxy_pass_header', 'limit_req', 'limit_req_status', 'limit_req_dry_run', 'limit_req_log_level', 'error_page', 'rewrite', 'set'):
                raise base.HardeningError('Identity child overrides would bypass recovery privacy.')
    for arguments in [['^~', '/realms/'], ['^~', '/resources/'], ['/']]:
        location = base.one(base.select(server.children, 'location', arguments), 'expected identity proxy location')
        base.one(base.select(location.children, 'proxy_pass', ['http://docker.home.cz:8081']), 'expected identity upstream')
    admin = base.one(base.select(server.children, 'location', ['^~', '/admin/']), 'identity administration denial')
    if len(admin.children) != 1 or not base.select(admin.children, 'return', ['404']):
        raise base.HardeningError('Unfamiliar public identity administration boundary.')


def render(original):
    if not original or len(original) > base.MAX_CONFIG or b'\x00' in original:
        raise base.HardeningError('Nginx identity configuration is empty, oversized or invalid.')
    try:
        text = original.decode('utf-8')
    except UnicodeDecodeError as error:
        raise base.HardeningError('Nginx identity configuration must be UTF-8.') from error
    newline = '\r\n' if '\r\n' in text else '\n'
    if '\r' in text.replace('\r\n', '') or (newline == '\r\n' and '\n' in text.replace('\r\n', '')):
        raise base.HardeningError('Mixed Nginx line endings are not supported.')
    top = base.clauses(text)
    formats = [item for item in base.select(top, 'log_format') if item.args[:1] == [FORMAT_NAME]]
    patches = []
    if formats:
        if base.one(formats, 'identity access format').args != [FORMAT_NAME, 'escape=json', FORMAT_BODY]:
            raise base.HardeningError('The identity access format differs from the reviewed allowlist.')
    else:
        patches.append((0, 0, FORMAT + newline))
    maps = [item for item in base.select(top, 'map') if RATE_KEY in item.args]
    if maps:
        rate_map = base.one(maps, 'identity POST rate-limit map')
        if rate_map.args != RATE_MAP_ARGS or [(child.name, child.args) for child in rate_map.children or []] != RATE_MAP_ROWS or any(child.children is not None for child in rate_map.children or []):
            raise base.HardeningError('Unfamiliar identity POST rate-limit key.')
    else:
        patches.append((0, 0, RATE_MAP.replace('\n', newline) + newline))
    zones = [item for item in base.select(top, 'limit_req_zone') if any(arg.startswith('zone=' + RATE_ZONE + ':') for arg in item.args)]
    if zones:
        if base.one(zones, 'identity POST rate-limit zone').args != RATE_ZONE_ARGS:
            raise base.HardeningError('Unfamiliar identity POST rate-limit zone.')
    else:
        patches.append((0, 0, RATE_ZONE_DIRECTIVE + newline))
    servers = [item for item in base.select(top, 'server') if named(item)]
    secure = []
    redirects = []
    for server in servers:
        listens = base.select(server.children, 'listen')
        ports = {item.args[0] for item in listens if item.args}
        if ports and ports.issubset({'443', '[::]:443'}) and all('ssl' in item.args for item in listens):
            secure.append(server)
        elif ports and ports.issubset({'80', '[::]:80'}):
            redirects.append(server)
        else:
            raise base.HardeningError('Unfamiliar identity listener.')
    https = base.one(secure, 'HTTPS identity virtual host')
    redirect = base.one(redirects, 'HTTP identity redirect')
    if base.one(base.select(https.children, 'server_name'), 'HTTPS identity server name').args != [HOST]:
        raise base.HardeningError('The HTTPS identity virtual host must be dedicated.')
    validate_locations(https)
    if base.select(https.children, 'rewrite') or any(item.args[:1] == [RATE_KEY] for item in base.select(https.children, 'set')):
        raise base.HardeningError('Identity rewrites or variable overrides would bypass the scoped POST limiter.')

    def directive(server, name, arguments, predicate=None):
        candidates = base.select(server.children, name)
        if predicate:
            candidates = [item for item in candidates if predicate(item)]
        line = name + ' ' + ' '.join('"' + arg + '"' if ' ' in arg else arg for arg in arguments) + ';'
        if candidates:
            old = base.one(candidates, 'identity ' + name)
            if old.children is not None:
                raise base.HardeningError('An identity privacy directive cannot be a block.')
            if old.args != arguments:
                patches.append((old.start, old.end, line))
        else:
            position, indentation = base.line_after(text, server, opening=True)
            patches.append((position, position, indentation + '    ' + line + newline))

    def protect(server):
        directive(server, 'access_log', ACCESS)
        directive(server, 'error_log', ERROR)
        directive(server, 'add_header', REFERRER, lambda item: item.args and item.args[0].lower() == 'referrer-policy')

    protect(https)
    directive(https, 'proxy_hide_header', ['Referrer-Policy'], lambda item: item.args and item.args[0].lower() == 'referrer-policy')
    if any(item.args and item.args[0].lower() == 'referrer-policy' for item in base.select(https.children, 'proxy_pass_header')):
        raise base.HardeningError('An upstream referrer policy override is not supported.')
    for name, arguments in RATE_DIRECTIVES:
        candidates = base.select(https.children, name)
        if name == 'error_page':
            candidates = [item for item in candidates if '429' in item.args[:-1]]
        if candidates and (len(candidates) != 1 or candidates[0].args != arguments):
            raise base.HardeningError('Unfamiliar existing identity POST limit or HTTP 429 handler.')
        directive(https, name, arguments, (lambda item: '429' in item.args[:-1]) if name == 'error_page' else None)
    handlers = base.select(https.children, 'location', [RATE_LOCATION])
    if handlers:
        base.one(handlers, 'identity rate-limit response')
    else:
        position, _ = base.line_after(text, https, opening=True)
        patches.append((position, position, RATE_HANDLER.replace('\n', newline)))
    redirect_name = base.one(base.select(redirect.children, 'server_name'), 'HTTP identity server name')
    allowed_redirect = {'listen', 'server_name', 'return', 'access_log', 'error_log', 'add_header'}
    if any(item.name not in allowed_redirect or item.children is not None for item in redirect.children):
        raise base.HardeningError('Unfamiliar HTTP identity redirect configuration.')
    base.one(base.select(redirect.children, 'return', ['301', 'https://$host$request_uri']), 'unchanged canonical HTTP redirect')
    if redirect_name.args == [HOST]:
        protect(redirect)
    elif redirect_name.args == ['studio-balance.cz', 'www.studio-balance.cz', HOST]:
        # Split only this host out of the old shared redirect. Sibling hosts
        # keep their exact original directives and redirect behaviour.
        patches.append((redirect_name.start, redirect_name.end, 'server_name studio-balance.cz www.studio-balance.cz;'))
        position, _ = base.line_after(text, redirect)
        lines = ['server {']
        lines += ['    ' + text[item.start:item.end] for item in base.select(redirect.children, 'listen')]
        lines += ['    server_name ' + HOST + ';', '    access_log ' + ' '.join(ACCESS) + ';', '    error_log ' + ' '.join(ERROR) + ';', '    add_header ' + ' '.join(REFERRER) + ';', '    return 301 https://$host$request_uri;', '}', '']
        patches.append((position, position, newline.join(lines)))
    else:
        raise base.HardeningError('Unfamiliar shared HTTP redirect hostnames.')
    for start, end, replacement in sorted(patches, key=lambda item: (item[0], item[1]), reverse=True):
        text = text[:start] + replacement + text[end:]
    return text.encode('utf-8')


def main():
    # Reuse the proven application lock and complete transactional CLI, but
    # substitute only the renderer; the general hardener remains unchanged.
    base.render = render
    base.__doc__ = __doc__
    base.main()


if __name__ == '__main__':
    try:
        main()
    except (base.HardeningError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f'Studio Balance identity privacy update refused/failed: {error}', file=sys.stderr)
        sys.exit(1)
