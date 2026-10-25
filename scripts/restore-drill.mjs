import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const cfg = JSON.parse(readFileSync(".local/test-config.json", "utf8"));
if (cfg.url !== "http://127.0.0.1:55431")
  throw Error("Restore drill is restricted to the isolated local project.");
const container = "supabase_db_band-payments";
const sql = (db, statement) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
if (
  sql(
    "postgres",
    "select environment from finance_private.configuration where id;",
  ) !== "local"
)
  throw Error("Database is not marked local.");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12),
  dbName = `band_restore_${suffix}`,
  bucket = `band-restore-${suffix}`;
const folder = `.local/backups/${suffix}`;
mkdirSync(folder, { recursive: true, mode: 0o700 });
const client = createClient(cfg.url, cfg.service, {
  auth: { persistSession: false },
});
const proofPath = `restore-proof/${suffix}.pdf`,
  proofBytes = new TextEncoder().encode(
    "%PDF-1.4\nLocal restore evidence only\n%%EOF",
  );
const checked = (r) => {
  if (r.error) throw Error(r.error.message);
  return r.data;
};
checked(
  await client.storage
    .from("band-documents")
    .upload(proofPath, proofBytes, { contentType: "application/pdf" }),
);
const manifest = [];
async function backupObjects(prefix = "") {
  let offset = 0;
  while (true) {
    const rows = checked(
      await client.storage
        .from("band-documents")
        .list(prefix, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
    );
    for (const row of rows) {
      const path = prefix ? `${prefix}/${row.name}` : row.name;
      if (!row.id) {
        await backupObjects(path);
        continue;
      }
      const blob = checked(
        await client.storage.from("band-documents").download(path),
      );
      const bytes = Buffer.from(await blob.arrayBuffer());
      const filename = `object-${manifest.length}.bin`;
      writeFileSync(`${folder}/${filename}`, bytes, { mode: 0o600 });
      manifest.push({
        path,
        filename,
        contentType: blob.type,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    if (rows.length < 100) break;
    offset += 100;
  }
}
let databaseCreated = false,
  bucketCreated = false;
try {
  await backupObjects();
  writeFileSync(`${folder}/objects.json`, JSON.stringify(manifest, null, 2), {
    mode: 0o600,
  });
  const dump = execFileSync(
    "docker",
    ["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc"],
    { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
  writeFileSync(`${folder}/database.dump`, dump, { mode: 0o600 });
  execFileSync(
    "docker",
    ["exec", container, "createdb", "-U", "postgres", dbName],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  databaseCreated = true;
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "pg_restore",
      "-U",
      "supabase_admin",
      "-d",
      dbName,
      "--exit-on-error",
    ],
    { input: dump, stdio: ["pipe", "ignore", "pipe"] },
  );
  const checks =
    "select json_build_object('gigs',(select count(*) from band_finance.gigs),'revisions',(select count(*) from band_finance.revisions),'approvals',(select count(*) from band_finance.approvals),'audit',(select count(*) from band_finance.audit_events),'jobs',(select count(*) from band_finance.outbox_jobs),'rls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='band_finance' and c.relrowsecurity),'workerDenied',not has_function_privilege('authenticated','band_finance.claim_job()','execute'),'submissionsDisabled',(select not submission_enabled from finance_private.configuration));";
  const source = sql("postgres", checks),
    restored = sql(dbName, checks);
  if (source !== restored) throw Error("Database restore comparison failed.");
  checked(await client.storage.createBucket(bucket, { public: false }));
  bucketCreated = true;
  for (const item of manifest) {
    const bytes = readFileSync(`${folder}/${item.filename}`);
    checked(
      await client.storage
        .from(bucket)
        .upload(item.path, bytes, { contentType: item.contentType }),
    );
    const roundTrip = Buffer.from(
      await checked(
        await client.storage.from(bucket).download(item.path),
      ).arrayBuffer(),
    );
    if (createHash("sha256").update(roundTrip).digest("hex") !== item.sha256)
      throw Error("Object checksum mismatch.");
  }
  const receipt = {
    verifiedAt: new Date().toISOString(),
    environment: "local",
    database: JSON.parse(restored),
    objectsRestored: manifest.length,
    checksumsVerified: true,
    backupFolder: folder,
  };
  writeFileSync(`${folder}/receipt.json`, JSON.stringify(receipt, null, 2), {
    mode: 0o600,
  });
  writeFileSync(
    ".local/restore-receipt.json",
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: "verified",
      environment: "local",
      objectsRestored: manifest.length,
      database: receipt.database,
    }),
  );
} finally {
  // Only the disposable resources created by this invocation are removed.
  if (databaseCreated)
    execFileSync(
      "docker",
      ["exec", container, "dropdb", "-U", "postgres", dbName],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  if (bucketCreated) {
    await client.storage.emptyBucket(bucket);
    await client.storage.deleteBucket(bucket);
  }
  await client.storage.from("band-documents").remove([proofPath]);
}
