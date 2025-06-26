
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle, ArchiveRestore, Trash2, ListX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GameServer } from "@/lib/types";
import { format } from 'date-fns';
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

interface RecoverableServer {
  recoveryFolderName: string;
  deletedAt: string;
  server: GameServer;
}

export default function RecoveryPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const [recoverableServers, setRecoverableServers] = React.useState<RecoverableServer[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [itemToProcess, setItemToProcess] = React.useState<RecoverableServer | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  const hasPermission = (p: string) => user?.permissions?.includes(p) ?? false;
  const canManageRecovery = hasPermission('manage_recovery');

  const fetchRecoverableServers = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/minecraft/servers/recovery");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch recoverable servers.");
      }
      const data: RecoverableServer[] = await response.json();
      setRecoverableServers(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (!canManageRecovery) {
      router.replace('/dashboard');
      return;
    }
    fetchRecoverableServers();
  }, [fetchRecoverableServers, canManageRecovery, router]);

  const handleRestore = async (item: RecoverableServer) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setItemToProcess(item);
    try {
      const response = await fetch('/api/minecraft/servers/recovery/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryFolderName: item.recoveryFolderName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      fetchRecoverableServers(); // Refresh list
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not restore server.";
      toast({ title: "Error Restoring", description: msg, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setItemToProcess(null);
    }
  };

  const initiateDelete = (item: RecoverableServer) => {
    setItemToProcess(item);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!itemToProcess || isProcessing) return;
    setIsProcessing(true);
    try {
      const response = await fetch('/api/minecraft/servers/recovery/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryFolderName: itemToProcess.recoveryFolderName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      fetchRecoverableServers(); // Refresh list
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not permanently delete server data.";
      toast({ title: "Error Deleting", description: msg, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setShowDeleteDialog(false);
      setItemToProcess(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "yyyy-MM-dd HH:mm:ss");
    } catch {
      return "Invalid date";
    }
  };

  if (!canManageRecovery) {
    return (
        <div className="container mx-auto py-8 flex justify-center items-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg">Redirecting...</p>
        </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <PageHeader
        title="Server Recovery"
        description="Restore or permanently delete servers that have been removed from the dashboard."
      />

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading recoverable servers...</p>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : recoverableServers.length === 0 ? (
        <Card>
          <CardHeader>
             <CardTitle className="flex items-center"><ListX className="mr-2 h-6 w-6 text-muted-foreground"/>No Recoverable Servers</CardTitle>
             <CardDescription>There are currently no servers in the recovery folder.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recoverable Servers</CardTitle>
            <CardDescription>
              Servers listed here can be restored to the dashboard or permanently removed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server Name</TableHead>
                  <TableHead className="hidden md:table-cell">Details</TableHead>
                  <TableHead>Deleted At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recoverableServers.map((item) => (
                  <TableRow key={item.recoveryFolderName}>
                    <TableCell className="font-medium">{item.server.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {item.server.softwareType} {item.server.serverVersion}
                    </TableCell>
                    <TableCell>{formatDate(item.deletedAt)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(item)}
                        disabled={isProcessing && itemToProcess?.recoveryFolderName === item.recoveryFolderName}
                      >
                        {isProcessing && itemToProcess?.recoveryFolderName === item.recoveryFolderName ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ArchiveRestore className="mr-2 h-4 w-4" />}
                        Restore
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => initiateDelete(item)}
                        disabled={isProcessing && itemToProcess?.recoveryFolderName === item.recoveryFolderName}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Permanently
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {itemToProcess && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete all data for the server 
                <strong> "{itemToProcess.server.name}"</strong>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90">
                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Deletion
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
