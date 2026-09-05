import { HttpException, HttpStatus, Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { RuntimeConfigService } from "../config/runtime-config.js";

type State = { requested_open: boolean; registration_synced: boolean };
export const closedAnnouncement = "Momentálně zavřeno. Studio zatím není v provozu. Registrace a rezervace spustíme, až oznámíme otevření.";
export function statusFromRow(row?: State) {
  const open = row?.requested_open === true && row.registration_synced === true;
  return { open, announcement: open ? null : closedAnnouncement,
    requestedOpen: row?.requested_open ?? false, registrationSynced: row?.registration_synced ?? false };
}
export async function requireOpenStudio(client: PoolClient) {
  const result = await client.query<State>("SELECT requested_open, registration_synced FROM studio_operation WHERE id=true FOR SHARE");
  if (!statusFromRow(result.rows[0]).open) throw new HttpException({ code: "STUDIO_CLOSED", message: closedAnnouncement }, HttpStatus.CONFLICT);
}

@Injectable()
export class RegistrationControl {
  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {}
  async setAllowed(allowed: boolean) {
    const { operationsClientId, operationsClientSecret } = this.config.value.oidc;
    const issuer = (this.config.value.oidc.operationsIssuer ?? this.config.value.oidc.issuer).replace(/\/$/, "");
    if (!operationsClientSecret) throw new Error("Registration control is not configured");
    const tokenResponse = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST", signal: AbortSignal.timeout(5000),
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: operationsClientId ?? "studio-balance-operations", client_secret: operationsClientSecret })
    });
    if (!tokenResponse.ok) throw new Error("Registration control authentication failed");
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) throw new Error("Registration control token missing");
    const endpoint = issuer.replace(/\/realms\//, "/admin/realms/");
    const headers = { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" };
    const updated = await fetch(endpoint, { method: "PUT", headers, signal: AbortSignal.timeout(5000), body: JSON.stringify({ registrationAllowed: allowed }) });
    if (!updated.ok) throw new Error("Registration control update failed");
    const verified = await fetch(endpoint, { headers, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!verified.ok || (await verified.json() as { registrationAllowed?: boolean }).registrationAllowed !== allowed) throw new Error("Registration control verification failed");
  }
}

@Injectable()
export class StudioStatusService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private syncing = false;
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RegistrationControl) private readonly registration: RegistrationControl) {}
  onModuleInit() {
    void this.retry();
    this.timer = setInterval(() => { void this.retry(); }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy() { clearInterval(this.timer); }
  private async retry() {
    if (this.syncing) return;
    this.syncing = true;
    try { await this.synchronize(); } catch { /* Persisted pending state remains visible and retried. */ }
    finally { this.syncing = false; }
  }
  async get() {
    const result = await this.database.query<State>("SELECT requested_open, registration_synced FROM studio_operation WHERE id=true");
    return statusFromRow(result.rows[0]);
  }
  async update(open: boolean, subject: string, requestId: string) {
    await this.database.transaction(async (client) => {
      await client.query("UPDATE studio_operation SET requested_open=$1, registration_synced=false, updated_at=now() WHERE id=true", [open]);
      await client.query(`INSERT INTO application_audit (actor_type,actor_id,action,entity_type,entity_id,request_id)
        VALUES ('admin',$1,'studio.opening.requested','studio_operation',$2,$3)`, [subject, open ? "open" : "closed", requestId]);
    });
    try { await this.synchronize(); }
    catch { throw new HttpException({ code: "REGISTRATION_SYNC_PENDING", message: "Rezervace jsou pozastavené. Změnu registrací se zatím nepodařilo potvrdit. Zkusíme to automaticky znovu; stav můžete obnovit." }, HttpStatus.SERVICE_UNAVAILABLE); }
    return this.get();
  }
  async synchronize() {
    await this.database.transaction(async (client) => {
      const result = await client.query<State>("SELECT requested_open, registration_synced FROM studio_operation WHERE id=true FOR UPDATE");
      const row = result.rows[0];
      if (!row || row.registration_synced) return;
      await this.registration.setAllowed(row.requested_open);
      await client.query("UPDATE studio_operation SET registration_synced=true, updated_at=now() WHERE id=true");
    });
  }
}
