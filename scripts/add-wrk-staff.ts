/**
 * Script to add Wrk staff members to the database
 * 
 * Usage:
 *   npx tsx scripts/add-wrk-staff.ts <email> <role>
 * 
 * Examples:
 *   npx tsx scripts/add-wrk-staff.ts admin@wrk.com wrk_admin
 *   npx tsx scripts/add-wrk-staff.ts master@wrk.com wrk_master_admin
 *   npx tsx scripts/add-wrk-staff.ts operator@wrk.com wrk_operator
 *   npx tsx scripts/add-wrk-staff.ts viewer@wrk.com wrk_viewer
 */

import { db } from "@/db";
import { users, wrkStaffMemberships } from "@/db/schema";
import { eq } from "drizzle-orm";

const VALID_ROLES = ["wrk_master_admin", "wrk_admin", "wrk_operator", "wrk_viewer"] as const;
type WrkStaffRole = (typeof VALID_ROLES)[number];

async function addWrkStaff(email: string, role: WrkStaffRole) {
  console.log(`Looking up user with email: ${email}`);
  
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    throw new Error(`User with email ${email} not found. Please create the user first.`);
  }

  console.log(`Found user: ${user.id} (${user.name || user.email})`);

  // Check if membership already exists
  const existing = await db.query.wrkStaffMemberships.findFirst({
    where: eq(wrkStaffMemberships.userId, user.id),
  });

  if (existing) {
    console.log(`Updating existing Wrk staff membership from ${existing.role} to ${role}`);
    await db
      .update(wrkStaffMemberships)
      .set({ 
        role,
        updatedAt: new Date(),
      })
      .where(eq(wrkStaffMemberships.userId, user.id));
    console.log(`✓ Successfully updated Wrk staff membership`);
  } else {
    console.log(`Creating new Wrk staff membership with role: ${role}`);
    await db.insert(wrkStaffMemberships).values({
      userId: user.id,
      role,
    });
    console.log(`✓ Successfully created Wrk staff membership`);
  }

  console.log(`\nUser ${email} is now a Wrk staff member with role: ${role}`);
  console.log(`They can now access the admin inbox at /admin/inbox`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("Usage: npx tsx scripts/add-wrk-staff.ts <email> <role>");
    console.error("\nValid roles:");
    VALID_ROLES.forEach((role) => console.error(`  - ${role}`));
    console.error("\nExamples:");
    console.error("  npx tsx scripts/add-wrk-staff.ts admin@wrk.com wrk_admin");
    console.error("  npx tsx scripts/add-wrk-staff.ts master@wrk.com wrk_master_admin");
    console.error("  npx tsx scripts/add-wrk-staff.ts operator@wrk.com wrk_operator");
    process.exit(1);
  }

  const [email, role] = args;

  if (!VALID_ROLES.includes(role as WrkStaffRole)) {
    console.error(`Invalid role: ${role}`);
    console.error(`Valid roles are: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  try {
    await addWrkStaff(email, role as WrkStaffRole);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

