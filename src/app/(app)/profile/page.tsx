
"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(6, "New password must be at least 6 characters."),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "New passwords do not match.",
  path: ["confirmPassword"],
});

type PasswordFormData = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema)
  });

  const onSubmit = async (data: PasswordFormData) => {
    if (!user) return;
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/auth/users/${user.username}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Failed to update password.');
      }
      
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });
      reset();

    } catch (error) {
      const msg = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({
        title: "Update Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <PageHeader title="My Profile" description="View your account details and manage your settings." />

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card>
            <CardHeader className="items-center text-center">
              <Avatar className="h-24 w-24 mb-4 text-3xl">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                  {user.username?.[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <CardTitle className="text-2xl">{user.username}</CardTitle>
              <CardDescription>Your assigned roles</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap justify-center gap-2">
              {user.roles?.map(role => (
                <Badge key={role} variant="secondary">{role}</Badge>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Enter your current password and a new password to update it.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input 
                    id="currentPassword" 
                    type="password" 
                    {...register("currentPassword")}
                    autoComplete="current-password"
                  />
                  {errors.currentPassword && <p className="text-sm text-destructive mt-1">{errors.currentPassword.message}</p>}
                </div>
                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input 
                    id="newPassword" 
                    type="password" 
                    {...register("newPassword")} 
                    autoComplete="new-password"
                  />
                  {errors.newPassword && <p className="text-sm text-destructive mt-1">{errors.newPassword.message}</p>}
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input 
                    id="confirmPassword" 
                    type="password" 
                    {...register("confirmPassword")} 
                    autoComplete="new-password"
                  />
                  {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword.message}</p>}
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
