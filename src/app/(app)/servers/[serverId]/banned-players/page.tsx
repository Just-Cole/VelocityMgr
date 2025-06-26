
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import { Loader2, AlertTriangle, ShieldOff, ListX, ArrowLeft, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BannedPlayerEntry, GameServer } from "@/lib/types";
import { format } from 'date-fns';
import { useAuth } from "@/contexts/AuthContext";

export default function BannedPlayersPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.serverId as string;
  const { toast } = useToast();
  const { user } = useAuth();
  
  const canUnban = user?.permissions?.includes('send_console_commands');

  const [server, setServer] = React.useState<GameServer | null>(null);
  const [bannedPlayers, setBannedPlayers] = React.useState<BannedPlayerEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [playerToUnban, setPlayerToUnban] = React.useState<BannedPlayerEntry | null>(null);
  const [showUnbanDialog, setShowUnbanDialog] = React.useState(false);
  const [isUnbanning, setIsUnbanning] = React.useState(false);
  const [isSendingCommand, setIsSendingCommand] = React.useState(false); // Shared command sending state

  const fetchServerDetails = React.useCallback(async () => {
    try {
      const response = await fetch("/api/minecraft/servers");
      if (!response.ok) throw new Error("Failed to fetch server list");
      const allServers: GameServer[] = await response.json();
      const foundServer = allServers.find(s => s.id === serverId);
      if (foundServer) {
        setServer(foundServer);
      } else {
        setError(`Server with ID "${serverId}" not found.`);
        setServer(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Error fetching server details: ${msg}`);
      setServer(null);
    }
  }, [serverId]);

  const fetchBannedPlayers = React.useCallback(async () => {
    if (!serverId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/banned-players`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to fetch banned players. Status: ${response.status}`);
      }
      const data: BannedPlayerEntry[] = await response.json();
      setBannedPlayers(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(errorMessage);
      toast({
        title: "Error Loading Banned Players",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [serverId, toast]);

  React.useEffect(() => {
    fetchServerDetails();
    fetchBannedPlayers();
  }, [fetchServerDetails, fetchBannedPlayers]);

  const handleSendCommand = async (command: string, successMessage: string) => {
    if (!command.trim() || !server || !serverId || isSendingCommand || !canUnban) return false;
    setIsSendingCommand(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to send command. Status: ${response.status}`);
      }
      toast({ title: "Command Sent", description: successMessage });
      return true;
    } catch (errorMsg) {
      const errorMessage = errorMsg instanceof Error ? errorMsg.message : "An unknown error occurred.";
      toast({ title: "Error Sending Command", description: errorMessage, variant: "destructive" });
      return false;
    } finally {
      setIsSendingCommand(false);
    }
  };

  const initiateUnbanPlayer = (player: BannedPlayerEntry) => {
    if (!canUnban) return;
    setPlayerToUnban(player);
    setShowUnbanDialog(true);
  };

  const confirmUnbanPlayer = async () => {
    if (!playerToUnban || !canUnban) return;
    setIsUnbanning(true);
    const commandToSendCommand = `pardon ${playerToUnban.name}`;
    const success = await handleSendCommand(commandToSendCommand, `Unban command sent for ${playerToUnban.name}.`);
    if (success) {
      // Optimistically remove from list or refetch
      // setBannedPlayers(prev => prev.filter(p => p.uuid !== playerToUnban.uuid));
      fetchBannedPlayers(); // Refetch to get the latest state
    }
    setShowUnbanDialog(false);
    setPlayerToUnban(null);
    setIsUnbanning(false);
  };

  const formatDateSafe = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    if (dateString.toLowerCase() === 'forever') return 'Forever';
    try {
      // Minecraft ban dates can be like "2023-10-26 15:30:00 -0700"
      // Need to parse this carefully. Date-fns might struggle with the timezone offset format directly.
      // For simplicity, we'll try Date.parse, but a more robust parser might be needed.
      const date = new Date(dateString.replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ([+\-]\d{4})/, '$1 GMT$2'));
      if (isNaN(date.getTime())) {
        return dateString; // Return original if parsing fails
      }
      return format(date, "yyyy-MM-dd HH:mm:ss");
    } catch (e) {
      return dateString; // Fallback to original string if parsing fails
    }
  };

  if (isLoading && !server) {
    return (
      <div className="container mx-auto py-8 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading banned player list...</p>
      </div>
    );
  }

  if (error && !server) { // Only show full page error if server details also failed
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Error" description="Failed to load banned player data." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push(`/servers/${serverId}/manage`)} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Server Management
        </Button>
      </div>
    );
  }
  
  const pageTitle = server ? `Banned Players: ${server.name}` : "Banned Players";
  const pageDescription = server ? `Manage banned players for ${server.name}.` : "Manage banned players.";


  return (
    <div className="container mx-auto py-2">
      <PageHeader title={pageTitle} description={pageDescription}>
        <Button onClick={() => router.push(`/servers/${serverId}/manage`)} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Manage
        </Button>
      </PageHeader>

      {isLoading && server && ( // Show loading indicator for banned list if server details are loaded
         <div className="flex justify-center items-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="ml-3 text-md">Loading banned players...</p>
        </div>
      )}

      {!isLoading && error && server && ( // Show error for banned list if server details are loaded
        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Banned Players</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && bannedPlayers.length === 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center"><ListX className="mr-2 h-6 w-6 text-muted-foreground"/>No Banned Players</CardTitle>
            <CardDescription>There are currently no players banned on this server.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isLoading && !error && bannedPlayers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Ban/>Banned Player List</CardTitle>
            <CardDescription>List of all players currently banned from this server.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">UUID</TableHead>
                  <TableHead>Banned On</TableHead>
                  <TableHead className="hidden sm:table-cell">Expires</TableHead>
                  <TableHead>Reason</TableHead>
                  {canUnban && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bannedPlayers.map((player) => (
                  <TableRow key={player.uuid}>
                    <TableCell className="font-medium">{player.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{player.uuid}</TableCell>
                    <TableCell>{formatDateSafe(player.created)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDateSafe(player.expires)}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={player.reason}>{player.reason}</TableCell>
                    {canUnban && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => initiateUnbanPlayer(player)}
                          disabled={isUnbanning || isSendingCommand || server?.status !== 'Online'}
                          title={server?.status !== 'Online' ? 'Server must be online to unban' : `Unban ${player.name}`}
                        >
                          <ShieldOff className="mr-2 h-4 w-4" /> Unban
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {playerToUnban && (
        <AlertDialog open={showUnbanDialog} onOpenChange={setShowUnbanDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unban Player: {playerToUnban.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to unban {playerToUnban.name}? They will be able to rejoin the server.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isUnbanning || isSendingCommand}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmUnbanPlayer} disabled={isUnbanning || isSendingCommand}>
                {(isUnbanning || isSendingCommand) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Unban
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
