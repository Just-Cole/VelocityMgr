
"use client"; 

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { GameServer } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { 
  PlusCircle, 
  ServerOff, 
  Loader2,
  Network,
  Users,
  MemoryStick,
  Cpu,
  Power,
  AlertTriangle,
  Play,
  StopCircle,
  RefreshCw,
  Settings2,
  ExternalLink,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

const SERVERS_POLL_INTERVAL = 1000; // 3 seconds

export default function DashboardPage() {
  const [servers, setServers] = React.useState<GameServer[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const canCreate = user?.permissions?.includes('create_servers');
  const canControl = user?.permissions?.includes('start_stop_servers');
  const canDelete = user?.permissions?.includes('delete_server');

  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [serverToDelete, setServerToDelete] = React.useState<GameServer | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const fetchServers = React.useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const response = await fetch("/api/minecraft/servers");
      if (!response.ok) {
        let errorDetail = `Server responded with status ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorDetail = errorData.message;
          }
        } catch (jsonError) {
          try {
              const textError = await response.text();
              errorDetail = textError.substring(0, 300); 
          } catch (textParseError) {
              // Fallback
          }
        }
        throw new Error(`Failed to fetch servers: ${response.statusText || errorDetail}`);
      }
      const data: GameServer[] = await response.json();
      setServers(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      if (isInitialLoad) {
        setError(errorMessage);
        toast({
          title: "Error Loading Servers",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        console.error("Silent error fetching servers on poll:", err);
      }
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  }, [toast]);

  React.useEffect(() => {
    fetchServers(true); // Initial fetch
    const intervalId = setInterval(() => fetchServers(false), SERVERS_POLL_INTERVAL);
    return () => clearInterval(intervalId); // Cleanup on component unmount
  }, [fetchServers]);

  const networkStats = React.useMemo(() => {
    const parseRamToMb = (ramString: string): number => {
      if (!ramString || typeof ramString !== 'string') return 0;
      const upper = ramString.toUpperCase();
      const value = parseInt(upper, 10);
      if (isNaN(value)) return 0;
      if (upper.endsWith('G')) return value * 1024;
      if (upper.endsWith('M')) return value;
      return value;
    };

    const onlineServers = servers.filter(s => s.status === 'Online');
    const totalPlayers = onlineServers.reduce((acc, s) => acc + (s.connectedPlayers?.length || 0), 0);
    const totalMaxPlayers = servers.reduce((acc, s) => acc + (s.maxPlayers || 0), 0);
    const totalRamUsed = onlineServers.reduce((acc, s) => acc + (s.currentRam || 0), 0);
    const totalMaxRam = servers.reduce((acc, s) => acc + parseRamToMb(s.maxRam), 0);

    const averageCpu = onlineServers.length > 0
      ? onlineServers.reduce((acc, s) => acc + (s.cpuUsage || 0), 0) / onlineServers.length
      : 0;
    
    return {
      onlineServersCount: onlineServers.length,
      totalServersCount: servers.length,
      totalPlayers,
      totalMaxPlayers,
      totalRamUsed,
      totalMaxRam,
      totalRamUsagePercentage: totalMaxRam > 0 ? (totalRamUsed / totalMaxRam) * 100 : 0,
      averageCpu: parseFloat(averageCpu.toFixed(1)),
    };
  }, [servers]);

  const handleDeleteServerInitiate = (server: GameServer) => {
    if (!canDelete) return;
    setServerToDelete(server);
    setShowDeleteDialog(true);
  };

  const confirmDeleteServer = async () => {
    if (!serverToDelete || !canDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverToDelete.id}/delete-recoverable`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to delete server. Status: ${response.status}`);
      }
      const result = await response.json();
      setServers((prevServers) => prevServers.filter(s => s.id !== serverToDelete.id));
      toast({
        title: "Server Deleted",
        description: result.message || `Server "${serverToDelete.name}" has been moved to recovery.`,
        variant: "default",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during deletion.";
      toast({
        title: "Error Deleting Server",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setServerToDelete(null);
    }
  };

  const handleServerAction = async (server: GameServer, action: 'start' | 'stop' | 'restart') => {
    if (!canControl) return;
    toast({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)}ing Server...`,
      description: `Requesting to ${action} server "${server.name}"...`,
    });

    try {
      const response = await fetch(`/api/minecraft/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          serverName: server.name, 
          serverVersion: server.serverVersion, 
          serverType: server.softwareType 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Failed to ${action} server.`);
      }
      
      setServers(prevServers => 
        prevServers.map(s => s.id === server.id ? (data.server || { ...s, status: action === 'start' ? 'Starting' : action === 'stop' ? 'stopping' : 'restarting' }) : s)
      );
      
      fetchServers(false);

      toast({
        title: `Server ${action} requested`,
        description: data.message || `Server "${server.name}" is now ${action}ing.`,
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `An unknown error occurred.`;
      toast({
        title: `Error ${action}ing Server`,
        description: errorMessage,
        variant: "destructive",
      });
      fetchServers(false);
    }
  };
  
  const getStatusBadge = (status: GameServer["status"]) => {
    const statusConfig = {
      Online: { variant: "default", icon: <Power className="h-3 w-3 text-green-400" /> },
      Offline: { variant: "secondary", icon: <Power className="h-3 w-3" /> },
      Starting: { variant: "outline", icon: <Loader2 className="h-3 w-3 animate-spin text-yellow-400" /> },
      restarting: { variant: "outline", icon: <Loader2 className="h-3 w-3 animate-spin text-blue-400" /> },
      stopping: { variant: "outline", icon: <Loader2 className="h-3 w-3 animate-spin text-orange-400" /> },
      Error: { variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
    } as const;

    const config = statusConfig[status] || statusConfig.Offline;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1.5 capitalize">
        {config.icon}
        {status}
      </Badge>
    );
  };


  return (
    <div className="container mx-auto py-2">
      <PageHeader title="Network Dashboard" description="High-level overview of your entire server network." />

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading network status...</p>
        </div>
      ) : error ? (
         <Alert variant="destructive" className="my-6">
          <ServerOff className="h-4 w-4" />
          <AlertTitle>Error Loading Network Data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12 rounded-lg border border-dashed">
          <ServerOff className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Servers Found</h2>
          <p className="text-muted-foreground mb-4">Get started by creating a new server.</p>
          {canCreate && (
             <Link href="/servers/create">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Create First Server
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Servers</CardTitle>
                <Network className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{networkStats.onlineServersCount} / {networkStats.totalServersCount}</div>
                <p className="text-xs text-muted-foreground">Online</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Players</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{networkStats.totalPlayers} / {networkStats.totalMaxPlayers}</div>
                <p className="text-xs text-muted-foreground">Across all online servers</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Network RAM Usage</CardTitle>
                <MemoryStick className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(networkStats.totalRamUsed / 1024).toFixed(2)} GB</div>
                <p className="text-xs text-muted-foreground">of {(networkStats.totalMaxRam / 1024).toFixed(2)} GB used ({networkStats.totalRamUsagePercentage.toFixed(0)}%)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average CPU Load</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{networkStats.averageCpu}%</div>
                <p className="text-xs text-muted-foreground">Across all online servers</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Servers</CardTitle>
              <CardDescription>Detailed list and actions for all servers in your network.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden w-[100px] md:table-cell">Players</TableHead>
                    <TableHead className="hidden w-[150px] md:table-cell">RAM</TableHead>
                    <TableHead className="hidden w-[100px] lg:table-cell">CPU</TableHead>
                    <TableHead className="w-[220px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers.map((server) => (
                    <TableRow key={server.id}>
                      <TableCell>{getStatusBadge(server.status)}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="truncate" title={server.name}>{server.name}</span>
                          <span className="text-xs text-muted-foreground">{server.ip}:{server.port}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{server.connectedPlayers?.length || 0} / {server.maxPlayers}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col">
                          <span>{server.ramUsage ?? 0}%</span>
                          <span className="text-xs text-muted-foreground">{server.currentRam || 0}MB / {server.maxRam}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{server.cpuUsage ?? 0}%</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          {canControl && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => handleServerAction(server, 'start')} disabled={server.status !== 'Offline'} title="Start">
                                <Play className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleServerAction(server, 'stop')} disabled={server.status === 'Offline' || server.status === 'stopping'} title="Stop">
                                <StopCircle className="h-4 w-4 text-destructive" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleServerAction(server, 'restart')} disabled={server.status === 'Offline' || server.status === 'stopping'} title="Restart">
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteServerInitiate(server)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                           <Link href={`/servers/${server.id}/manage`} passHref>
                              <Button variant="outline" size="sm" className="ml-2">
                                Manage
                              </Button>
                           </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {serverToDelete && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will stop the server (if running) and move its data to a recovery folder. 
                The server "{serverToDelete.name}" will be removed from the dashboard.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteServer} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
