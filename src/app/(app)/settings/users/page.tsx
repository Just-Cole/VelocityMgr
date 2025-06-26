
"use client";

import * as React from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Trash2, Users, AlertTriangle, KeyRound, BadgeInfo, Pencil } from "lucide-react";
import type { AppUser, Role } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const addUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters long."),
  password: z.string().min(6, "Password must be at least 6 characters long."),
  roles: z.array(z.string()).min(1, "At least one role must be selected."),
});
type AddUserFormData = z.infer<typeof addUserSchema>;

export default function UserManagementPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [userToDelete, setUserToDelete] = React.useState<AppUser | null>(null);
  const [userToEdit, setUserToEdit] = React.useState<AppUser | null>(null);
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>([]);
  
  const hasPermission = React.useCallback((p: string) => user?.permissions?.includes(p) ?? false, [user?.permissions]);
  const canCreateUsers = hasPermission('create_users');
  const canAssignRoles = hasPermission('assign_roles');

  const { control, handleSubmit, reset, setValue } = useForm<AddUserFormData>({
    resolver: zodResolver(addUserSchema),
    defaultValues: { username: "", password: "", roles: [] },
  });

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/auth/users"),
        fetch("/api/auth/roles")
      ]);
      if (!usersRes.ok || !rolesRes.ok) throw new Error("Failed to fetch data.");
      const usersData: AppUser[] = await usersRes.json();
      const rolesData: Record<string, {permissions: string[]}> = await rolesRes.json();
      const rolesArray = Object.keys(rolesData).map(name => ({ name, permissions: rolesData[name].permissions }));
      setUsers(usersData);
      setRoles(rolesArray);
    } catch (error) {
      toast({ title: "Error", description: "Could not fetch user and role data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (!hasPermission('assign_roles')) {
      router.replace('/dashboard');
      return;
    }
    fetchData();
  }, [hasPermission, router, fetchData]);
  
  const onAddUser = async (data: AddUserFormData) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      reset();
      fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not add user.";
      toast({ title: "Error Adding User", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onUpdateUserRoles = async () => {
    if (!userToEdit) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/users/${userToEdit.username}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: selectedRoles }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      setUserToEdit(null);
      fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not update roles.";
      toast({ title: "Error Updating Roles", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/users/${userToDelete.username}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      setUserToDelete(null);
      fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not delete user.";
      toast({ title: "Error Deleting User", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPermission('assign_roles')) {
    return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin"/></div>;
  }

  return (
    <div className="container mx-auto py-2">
      <PageHeader title="User Management" description="Assign roles to application users." >
        {hasPermission('manage_roles') && (
            <Link href="/settings/roles">
              <Button variant="outline">
                <KeyRound className="mr-2 h-4 w-4" /> Manage Roles
              </Button>
            </Link>
        )}
      </PageHeader>

      <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Current Users</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.username}>
                        <TableCell className="font-medium">{u.username}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map(r => <Badge key={r} variant="secondary">{r}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => { setUserToEdit(u); setSelectedRoles(u.roles); }} disabled={!canAssignRoles}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setUserToDelete(u)} disabled={users.length <= 1}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {canCreateUsers && (
          <Card>
            <CardHeader>
              <CardTitle>Add New User</CardTitle>
              <CardDescription>Create a new account and assign roles.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onAddUser)} className="space-y-4">
                <Controller name="username" control={control} render={({ field, fieldState }) => (
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" placeholder="new.user" {...field} />
                    {fieldState.error && <p className="text-sm text-destructive mt-1">{fieldState.error.message}</p>}
                  </div>
                )}/>
                <Controller name="password" control={control} render={({ field, fieldState }) => (
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" {...field} />
                    {fieldState.error && <p className="text-sm text-destructive mt-1">{fieldState.error.message}</p>}
                  </div>
                )}/>
                <Controller name="roles" control={control} render={({ field, fieldState }) => (
                  <div>
                    <Label>Roles</Label>
                    <div className="space-y-2 rounded-md border p-2">
                      {roles.map(role => (
                        <div key={role.name} className="flex items-center gap-2">
                          <Checkbox
                            id={`role-${role.name}`}
                            checked={field.value.includes(role.name)}
                            onCheckedChange={(checked) => {
                              return checked
                                ? field.onChange([...field.value, role.name])
                                : field.onChange(field.value.filter(v => v !== role.name));
                            }}
                          />
                          <Label htmlFor={`role-${role.name}`} className="font-normal">{role.name}</Label>
                        </div>
                      ))}
                    </div>
                    {fieldState.error && <p className="text-sm text-destructive mt-1">{fieldState.error.message}</p>}
                  </div>
                )}/>
                <Button type="submit" disabled={isSubmitting} className="w-full">
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Add User
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!userToEdit} onOpenChange={(open) => !open && setUserToEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Roles for {userToEdit?.username}</DialogTitle>
            <DialogDescription>Select the roles to assign to this user.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            {roles.map((role) => (
              <div key={role.name} className="flex items-center gap-2">
                <Checkbox
                  id={`edit-role-${role.name}`}
                  checked={selectedRoles.includes(role.name)}
                  onCheckedChange={(checked) => {
                    setSelectedRoles(prev => checked ? [...prev, role.name] : prev.filter(r => r !== role.name));
                  }}
                />
                <Label htmlFor={`edit-role-${role.name}`} className="font-normal">{role.name}</Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={onUpdateUserRoles} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete User?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogDescription>Are you sure you want to delete {userToDelete?.username}? This cannot be undone.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/80">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
