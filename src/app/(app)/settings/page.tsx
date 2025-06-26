
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Save, Palette, BellDot } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();

  // Appearance States
  const [darkMode, setDarkMode] = React.useState(true); 

  // Notifications States
  const [globalNotifications, setGlobalNotifications] = React.useState(true);
  const [serverStatusAlerts, setServerStatusAlerts] = React.useState(true);
  const [backupCompletionAlerts, setBackupCompletionAlerts] = React.useState(false);
  const [emailNotifications, setEmailNotifications] = React.useState(false);
  const [notificationEmail, setNotificationEmail] = React.useState("user@example.com");

  const handleSaveChanges = () => {
    console.log("Settings saved:", { 
      darkMode,
      globalNotifications, serverStatusAlerts, backupCompletionAlerts, emailNotifications, notificationEmail,
    });
    toast({
      title: "Settings Saved",
      description: "Your preferences have been updated.",
    });
  };

  return (
    <div className="container mx-auto py-2">
      <PageHeader title="Application Settings" description="Manage your preferences and application configuration." />

      <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-2">
        
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Palette /> Appearance</CardTitle>
            <CardDescription>Customize the look and feel of the application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <Label htmlFor="dark-mode" className="flex flex-col space-y-1">
                <span>Dark Mode</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Toggle dark theme for the application.
                </span>
              </Label>
              <Switch
                id="dark-mode"
                checked={darkMode}
                onCheckedChange={setDarkMode}
                aria-label="Toggle dark mode"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><BellDot /> Notifications</CardTitle>
            <CardDescription>Manage how you receive notifications from the application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <Label htmlFor="global-notifications" className="flex flex-col space-y-1">
                <span>Enable All App Notifications</span>
                <span className="font-normal leading-snug text-muted-foreground">
                  Master switch for in-app notifications.
                </span>
              </Label>
              <Switch
                id="global-notifications"
                checked={globalNotifications}
                onCheckedChange={setGlobalNotifications}
              />
            </div>
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-medium text-sm">Specific Alerts (if global enabled):</h4>
              <div className="flex items-center justify-between pl-4">
                <Label htmlFor="server-status-alerts" className="text-sm font-normal">Server Online/Offline Alerts</Label>
                <Switch id="server-status-alerts" checked={serverStatusAlerts} onCheckedChange={setServerStatusAlerts} disabled={!globalNotifications}/>
              </div>
              <div className="flex items-center justify-between pl-4">
                <Label htmlFor="backup-alerts" className="text-sm font-normal">Backup Completion/Failure Alerts</Label>
                <Switch id="backup-alerts" checked={backupCompletionAlerts} onCheckedChange={setBackupCompletionAlerts} disabled={!globalNotifications}/>
              </div>
            </div>
             <div className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                    <Label htmlFor="email-notifications" className="flex flex-col space-y-1">
                        <span>Enable Email Notifications</span>
                        <span className="font-normal leading-snug text-muted-foreground">
                        Receive important updates via email.
                        </span>
                    </Label>
                    <Switch id="email-notifications" checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                </div>
                {emailNotifications && (
                    <div>
                        <Label htmlFor="notification-email">Notification Email Address</Label>
                        <Input id="notification-email" type="email" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} className="mt-1" placeholder="your@email.com" />
                    </div>
                )}
             </div>
          </CardContent>
        </Card>
        
      </div>

      <div className="mt-12 flex justify-end border-t pt-6">
        <Button onClick={handleSaveChanges} size="lg">
          <Save className="mr-2 h-5 w-5" /> Save All Settings
        </Button>
      </div>
    </div>
  );
}
