#!/usr/bin/env python3
"""Provision only Studio Balance's registration service account. Run on Docker host
with --production, or locally with --local. Bootstrap credentials remain in memory.
Production runtime receives only the realm-scoped service account secret.
"""
import argparse, getpass, json, os, pathlib, secrets, subprocess, tempfile, urllib.request, urllib.parse
parser = argparse.ArgumentParser()
parser.add_argument('--production', action='store_true')
parser.add_argument('--local', action='store_true')
a = parser.parse_args()
if a.production == a.local: raise SystemExit('Choose exactly --production or --local')
if a.production:
    if not pathlib.Path('/home/voldzi/deployments/studio-balance/.env.production').is_file():
        raise SystemExit('Spusťte skript na docker.home.cz.')
    username = input('Správce Keycloak master [admin]: ').strip() or 'admin'
    password = getpass.getpass('Heslo správce (nezobrazuje se): ')
    otp = getpass.getpass('Jednorázový kód MFA, pokud je vyžadován (jinak Enter): ')
else:
    container = subprocess.check_output(['docker','compose','ps','-q','keycloak'],text=True).strip()
    if not container: raise SystemExit('Local Keycloak is not running')
    e = dict(v.split('=',1) for v in json.loads(subprocess.check_output(['docker','inspect',container,'--format','{{json .Config.Env}}'],text=True)))
    username, password, otp = e['KC_BOOTSTRAP_ADMIN_USERNAME'], e['KC_BOOTSTRAP_ADMIN_PASSWORD'], ''
base = 'https://login.studio-balance.cz' if a.production else 'http://127.0.0.1:8081'
def request(path, method='GET', data=None, token=None):
    headers = {}
    if token: headers['Authorization']='Bearer '+token
    if isinstance(data,dict): data=json.dumps(data).encode(); headers['Content-Type']='application/json'
    elif data is not None: headers['Content-Type']='application/x-www-form-urlencoded'
    with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=headers,method=method),timeout=10) as r:
        raw=r.read(); return json.loads(raw) if raw else None
try:
    admin=request('/realms/master/protocol/openid-connect/token','POST',urllib.parse.urlencode({'grant_type':'password','client_id':'admin-cli','username':username,'password':password,**({'totp':otp} if otp else {})}).encode())['access_token']
    password = otp = ''
    realm='/admin/realms/studio-balance'
    client_id='studio-balance-operations'
    clients=request(realm+'/clients?clientId='+client_id,token=admin)
    if not clients:
        request(realm+'/clients','POST',{'clientId':client_id,'enabled':True,'publicClient':False,'serviceAccountsEnabled':True,'standardFlowEnabled':False,'directAccessGrantsEnabled':False,'fullScopeAllowed':True,'secret':secrets.token_urlsafe(48) if a.production else 'local-operations-client-only'},admin)
        clients=request(realm+'/clients?clientId='+client_id,token=admin)
    cid=clients[0]['id']
    # The service user has only its dedicated realm role; full scope includes it in tokens.
    request(realm+'/clients/'+cid,'PUT',{'fullScopeAllowed':True},admin)
    user=request(realm+'/clients/'+cid+'/service-account-user',token=admin)
    management=request(realm+'/clients?clientId=realm-management',token=admin)[0]['id']
    role=request(realm+'/clients/'+management+'/roles/manage-realm',token=admin)
    payload=json.dumps([role]).encode()
    req=urllib.request.Request(base+realm+'/users/'+user['id']+'/role-mappings/clients/'+management,data=payload,method='POST',headers={'Authorization':'Bearer '+admin,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=10): pass
    secret=request(realm+'/clients/'+cid+'/client-secret',token=admin)['value']
    token=request('/realms/studio-balance/protocol/openid-connect/token','POST',urllib.parse.urlencode({'grant_type':'client_credentials','client_id':client_id,'client_secret':secret}).encode())['access_token']
    request(realm,'PUT',{'registrationAllowed':False},token)
    if request(realm,token=token)['registrationAllowed'] is not False: raise RuntimeError('Registration state was not confirmed')
    envpath=pathlib.Path('/home/voldzi/deployments/studio-balance/.env.production') if a.production else pathlib.Path('.env')
    original=envpath.read_text()
    if a.production:
        backup=envpath.with_name('.env.production.before-registration-control')
        if not backup.exists(): backup.write_text(original); backup.chmod(0o600)
    lines=[x for x in original.splitlines() if not x.startswith(('OIDC_OPERATIONS_CLIENT_ID=','OIDC_OPERATIONS_CLIENT_SECRET='))]
    lines += ['OIDC_OPERATIONS_CLIENT_ID='+client_id,'OIDC_OPERATIONS_CLIENT_SECRET='+secret]
    fd, temporary = tempfile.mkstemp(prefix='.registration-env-', dir=envpath.parent)
    with os.fdopen(fd,'w') as f:
        f.write('\n'.join(lines)+'\n'); f.flush(); os.fsync(f.fileno())
    os.replace(temporary,envpath)
    print('Dedicated registration control provisioned; registration disabled; runtime credential saved privately.')
except Exception as error:
    # Emit only recognized OAuth failure categories, never credentials or tokens.
    category = ''
    if hasattr(error, 'read'):
        try:
            failure = json.loads(error.read())
            for known in ['HTTPS required', 'Invalid user credentials', 'Account is not fully set up', 'Account disabled', 'Invalid client credentials']:
                if known.lower() in str(failure.get('error_description', '')).lower(): category = known
            if failure.get('error') in ['invalid_grant', 'unauthorized_client', 'invalid_client']: category += ' '+failure['error']
        except (ValueError, TypeError): pass
    raise SystemExit('Registration provisioning failed: '+type(error).__name__+' status='+str(getattr(error,'code','unknown'))+' path='+urllib.parse.urlparse(getattr(error,'url','')).path+' '+category)
