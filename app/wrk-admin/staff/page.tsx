import { requireWrkStaffSession } from "@/lib/api/context";
import { listStaffUsers } from "@/lib/services/platform-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StaffTable from "./staffTable";
import { AddStaffForm } from "./addStaffForm";

export type StaffRow = Awaited<ReturnType<typeof listStaffUsers>>[number];

export default async function StaffPage() {
  const session = await requireWrkStaffSession();
  const staffRole = session.wrkStaffRole;

  if (staffRole !== "wrk_master_admin") {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <Card>
          <CardHeader>
            <CardTitle>Not authorized</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Only Master Admins can manage Wrk staff roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const staff = await listStaffUsers();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="text-sm text-muted-foreground">Manage WRK staff roles and access.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add Staff</CardTitle>
        </CardHeader>
        <CardContent>
          <AddStaffForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Staff Directory</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <StaffTable staff={staff} staffRole={staffRole} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

