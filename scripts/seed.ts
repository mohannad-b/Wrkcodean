// scripts/seed.ts
import * as dotenv from "dotenv";
import { and, eq } from "drizzle-orm";
import { pool, db } from "../db";
import { memberships, tenants, users } from "../db/schema";

dotenv.config({ path: ".env.local" });

type SeedResult = {
  tenantId: string;
  ownerUserId: string;
  adminUserId: string;
};

async function ensureTenant(): Promise<{ id: string; slug: string }> {
  const slug = "acme-demo";

  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
  });

  if (existing) {
    return existing;
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Acme Demo",
      slug,
    })
    .returning();

  if (!tenant) {
    throw new Error("Failed to insert tenant");
  }

  return tenant;
}

async function ensureUser(params: { email: string; name: string; avatarUrl?: string }) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, params.email),
  });

  if (existing) {
    return existing;
  }

  const [user] = await db
    .insert(users)
    .values({
      email: params.email,
      name: params.name,
      avatarUrl: params.avatarUrl,
    })
    .returning();

  if (!user) {
    throw new Error(`Failed to insert user ${params.email}`);
  }

  return user;
}

async function ensureMembership(params: { tenantId: string; userId: string; role: "owner" | "admin" }) {
  const existing = await db.query.memberships.findFirst({
    where: and(eq(memberships.tenantId, params.tenantId), eq(memberships.userId, params.userId)),
  });

  if (existing) {
    return existing;
  }

  const [membership] = await db
    .insert(memberships)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      role: params.role,
    })
    .returning();

  if (!membership) {
    throw new Error("Failed to insert membership");
  }

  return membership;
}

async function seed(): Promise<SeedResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run the seed script.");
  }

  const tenant = await ensureTenant();

  const clientAdmin = await ensureUser({
    email: "client-admin@acme-demo.com",
    name: "Client Admin",
  });

  const opsAdmin = await ensureUser({
    email: "ops-admin@wrk.internal",
    name: "Ops Admin",
  });

  await ensureMembership({
    tenantId: tenant.id,
    userId: clientAdmin.id,
    role: "owner",
  });

  await ensureMembership({
    tenantId: tenant.id,
    userId: opsAdmin.id,
    role: "admin",
  });

  return {
    tenantId: tenant.id,
    ownerUserId: clientAdmin.id,
    adminUserId: opsAdmin.id,
  };
}

seed()
  .then((result) => {
    console.log("✅ Seed complete");
    console.table(result);
  })
  .catch((error) => {
    console.error("❌ Seed failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

