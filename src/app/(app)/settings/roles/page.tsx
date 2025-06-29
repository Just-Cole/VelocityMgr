
"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Trash2, KeyRound, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";


const roleSchema = z.object({
  name: z.string().min(3, "Role name must be at least 3 characters long."),
  permissions: z.array(z.string()).min(1, "At least one permission must be selected."),
});
type RoleFormData = z.infer<typeof roleSchema>;

interface Role {
  name: string;
  permissions: string[];
}

const SYSTEM_ROLES = ["Admin", "Operator", "Moderator", "Viewer"];

export default function RoleManagementPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const [roles, setRoles] = React.useState<Role[]>([]);
  const [availablePermissions, setAvailablePermissions] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);

  const [roleToDelete, setRoleToDelete] = React.useState<Role | null>(null);
  const [editingRole, setEditingRole] = React.useState<Role | null>(null);

  const { control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: "", permissions: [] },
  });
  
  const hasPermission = React.useCallback((p: string) => user?.permissions?.includes(p) ?? false, [user?.permissions]);
  
  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch("/api/auth/roles"),
        fetch("/api/auth/permissions"),
      ]);
      if (!rolesRes.ok || !permsRes.ok) throw new Error("Failed to fetch initial data.");
      const rolesData: Record<string, { permissions: string[] }> = await rolesRes.json();
      const permsData: string[] = await permsRes.json();

      const rolesArray = Object.keys(rolesData).map(name => ({ name, permissions: rolesData[name].permissions }));
      setRoles(rolesArray);
      setAvailablePermissions(permsData);
    } catch (error) {
      toast({ title: "Error", description: "Could not load roles and permissions.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  React.useEffect(() => {
    if (!hasPermission('manage_roles')) {
      router.replace('/dashboard');
      return;
    }
    fetchData();
  }, [hasPermission, router, fetchData]);

  const handleEditClick = (role: Role) => {
    setIsEditing(true);
    setEditingRole(role);
    setValue("name", role.name);
    setValue("permissions", role.permissions);
  };
  
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingRole(null);
    reset({ name: "", permissions: [] });
  };
  
  const onSubmit = async (data: RoleFormData) => {
    setIsSubmitting(true);
    const apiEndpoint = isEditing ? `/api/auth/roles/${editingRole?.name}` : '/api/auth/roles';
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const response = await fetch(apiEndpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      handleCancelEdit();
      fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : `Could not ${isEditing ? 'update' : 'create'} role.`;
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/roles/${roleToDelete.name}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      setRoleToDelete(null);
      fetchData();
    } catch (error) {
       const msg = error instanceof Error ? error.message : "Could not delete role.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasPermission('manage_roles')) {
     return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin"/></div>;
  }
  
  return (
    <div className="container mx-auto py-2">
      <PageHeader title="Role Management" description="Create and manage roles and their permissions." />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Existing Roles</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-8 w-8 animate-spin" /></div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {roles.map(role => (
                    <AccordionItem value={role.name} key={role.name}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-4">
                            <span className="font-semibold text-lg">{role.name}</span>
                            {SYSTEM_ROLES.includes(role.name) && <Badge>System</Badge>}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-4 bg-muted/50 rounded-md">
                        <h4 className="font-medium mb-2">Permissions:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                          {role.permissions.map(p => <span key={p}>{p}</span>)}
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                           {!SYSTEM_ROLES.includes(role.name) && (
                             <>
                               <Button variant="outline" size="sm" onClick={() => handleEditClick(role)}><Pencil className="mr-2 h-4 w-4"/>Edit</Button>
                               <Button variant="destructive" size="sm" onClick={() => setRoleToDelete(role)}><Trash2 className="mr-2 h-4 w-4"/>Delete</Button>
                             </>
                           )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>{isEditing ? 'Edit Role' : 'Create New Role'}</CardTitle>
            <CardDescription>{isEditing ? `Modify permissions for the "${editingRole?.name}" role.` : 'Define a new role and its permissions.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Controller name="name" control={control} render={({ field, fieldState }) => (
                <div>
                  <Label htmlFor="name">Role Name</Label>
                  <Input id="name" {...field} disabled={isEditing} />
                  {fieldState.error && <p className="text-sm text-destructive mt-1">{fieldState.error.message}</p>}
                </div>
              )} />
              
              <Controller name="permissions" control={control} render={({ field, fieldState }) => (
                <div>
                  <Label>Permissions</Label>
                  <Card className="max-h-80 overflow-y-auto p-4 mt-1">
                    <div className="space-y-2">
                    {availablePermissions.map(perm => (
                      <div key={perm} className="flex items-center gap-2">
                        <Checkbox 
                          id={perm}
                          checked={field.value.includes(perm)}
                          onCheckedChange={(checked) => {
                            return checked
                              ? field.onChange([...field.value, perm])
                              : field.onChange(field.value.filter(p => p !== perm));
                          }}
                        />
                        <Label htmlFor={perm} className="font-normal">{perm}</Label>
                      </div>
                    ))}
                    </div>
                  </Card>
                  {fieldState.error && <p className="text-sm text-destructive mt-1">{fieldState.error.message}</p>}
                </div>
              )} />

              <div className="flex gap-2 justify-end">
                {isEditing && <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancel</Button>}
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                  {isEditing ? 'Save Changes' : 'Create Role'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

       <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role: {roleToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This role will be removed from all users. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRole} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/80">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
              Delete Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
