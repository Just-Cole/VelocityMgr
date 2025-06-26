
"use client";

import * as React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ServerIcon, 
  Cpu, 
  MemoryStick, 
  Power, 
  Settings2, 
  Trash2, 
  ExternalLink, 
  AlertTriangle, 
  RefreshCw, 
  Loader2 as Loader,
  Play, 
  StopCircle 
} from "lucide-react";
import type { GameServer } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from 'date-fns';


interface ServerCardProps {
  server: GameServer;
  onDelete: (server: GameServer) => void;
  onStartServer: (server: GameServer) => Promise<void>;
  onStopServer: (server: GameServer) => Promise<void>;
  onRestartServer: (server: GameServer) => Promise<void>;
  canEdit: boolean;
}

export function ServerCard({ server, onDelete, onStartServer, onStopServer, onRestartServer, canEdit }: ServerCardProps) {
  const [formattedLastOnline, setFormattedLastOnline] = React.useState<string | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);
  const [isRestarting, setIsRestarting] = React.useState(false);

  const isActionInProgress = isStarting || isStopping || isRestarting;

  React.useEffect(() => {
    if (server.lastOnline) {
      setFormattedLastOnline(formatDistanceToNow(new Date(server.lastOnline), { addSuffix: true }));
    } else {
      setFormattedLastOnline('N/A'); 
    }
  }, [server.lastOnline]);

  const getStatusBadgeVariant = (status: GameServer["status"]) => {
    switch (status) {
      case "Online":
        return "default"; 
      case "Offline":
        return "secondary";
      case "Starting":
      case "restarting": 
      case "stopping": 
        return "outline"; 
      case "Error":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: GameServer["status"]) => {
    switch (status) {
      case "Online":
        return <Power className="h-4 w-4 text-green-500" />;
      case "Offline":
        return <Power className="h-4 w-4 text-muted-foreground" />;
      case "Starting":
        return <Loader className="h-4 w-4 text-yellow-500 animate-spin" />; 
      case "restarting": 
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case "stopping": 
        return <Loader className="h-4 w-4 text-orange-500 animate-spin" />;
      case "Error":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <Power className="h-4 w-4 text-muted-foreground" />;
    }
  }
  
  const serverStatusDisplay = server.status.charAt(0).toUpperCase() + server.status.slice(1);
  const cpuUsage = server.cpuUsage ?? 0;
  const ramUsage = server.ramUsage ?? 0;

  const handleStart = async () => {
    if (!canEdit) return;
    setIsStarting(true);
    await onStartServer(server);
    setIsStarting(false);
  };

  const handleStop = async () => {
    if (!canEdit) return;
    setIsStopping(true);
    await onStopServer(server);
    setIsStopping(false);
  };

  const handleRestart = async () => {
    if (!canEdit) return;
    setIsRestarting(true);
    await onRestartServer(server);
    setIsRestarting(false);
  };
  
  const canStart = !isActionInProgress && (server.status === 'Offline' || server.status === 'Error');
  const canStop = !isActionInProgress && (server.status === 'Online' || server.status === 'Starting' || server.status === 'restarting' || server.status === 'Error');
  const canRestart = !isActionInProgress && (server.status === 'Online' || server.status === 'Starting' || server.status === 'restarting' || server.status === 'Error');


  return (
    <TooltipProvider>
      <Card className="flex flex-col h-full shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <ServerIcon className="h-6 w-6 text-primary" />
              {server.name}
            </CardTitle>
            <Badge variant={getStatusBadgeVariant(server.status)} className="flex items-center gap-1 text-xs">
              {getStatusIcon(server.status)}
              {serverStatusDisplay}
            </Badge>
          </div>
          <CardDescription>
            {server.ip}:{server.port} ({server.softwareType} {server.serverVersion})
            <br />
            Last seen: {formattedLastOnline || 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Cpu className="h-4 w-4" /> CPU Usage
              </span>
              <span>{cpuUsage}%</span>
            </div>
            <Progress value={cpuUsage} aria-label={`CPU usage ${cpuUsage}%`} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <MemoryStick className="h-4 w-4" /> RAM Usage
              </span>
              <span>{server.currentRam || 0}MB / {server.maxRam}</span>
            </div>
            <Progress value={ramUsage} aria-label={`RAM usage ${ramUsage}%`} />
            <p className="text-xs text-muted-foreground text-right mt-1">Usage: {ramUsage}%</p>
          </div>
          {server.linkedInstances && server.linkedInstances.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1 text-muted-foreground">Linked Instances:</h4>
              <div className="flex flex-wrap gap-1">
                {server.linkedInstances.slice(0,3).map(instance => (
                   <Tooltip key={instance.id}>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs">{instance.name}</Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{instance.name} ({instance.version}) - {instance.status}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {server.linkedInstances.length > 3 && (
                  <Badge variant="outline" className="text-xs">+{server.linkedInstances.length - 3} more</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <Separator className="my-2" />
        <CardFooter className="flex flex-col items-stretch gap-2 pt-4 sm:flex-row sm:justify-between">
          {canEdit && (
            <div className="flex gap-2 flex-wrap justify-start sm:justify-start">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleStart} disabled={!canStart} aria-label="Start Server">
                    {isStarting ? <Loader className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Start Server</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="destructive" size="icon" onClick={handleStop} disabled={!canStop} aria-label="Stop Server">
                    {isStopping ? <Loader className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stop Server</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleRestart} disabled={!canRestart} aria-label="Restart Server">
                    {isRestarting ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restart Server</TooltipContent>
              </Tooltip>
            </div>
          )}
          <div className="flex gap-2 flex-wrap justify-end border-t sm:border-t-0 pt-2 sm:pt-0">
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(server)} aria-label={`Delete server ${server.name}`} disabled={isActionInProgress}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Server</TooltipContent>
              </Tooltip>
            )}
            <Link href={`/servers/${server.id}/edit`} passHref legacyBehavior>
              <Button variant="outline" size="sm" aria-label={`Edit server ${server.name}`} disabled={isActionInProgress && canEdit}>
                <Settings2 className="mr-2 h-4 w-4" /> {canEdit ? 'Edit' : 'View'}
              </Button>
            </Link>
            <Link href={`/servers/${server.id}/manage`} passHref legacyBehavior>
              <Button size="sm" aria-label={`Manage server ${server.name}`} disabled={isActionInProgress && canEdit}>
                <ExternalLink className="mr-2 h-4 w-4" /> Manage
              </Button>
            </Link>
          </div>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
