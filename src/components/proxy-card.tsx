"use client";

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
import { Server, Cpu, MemoryStick, Power, Settings2, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import type { VelocityProxy } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from 'date-fns';


interface ProxyCardProps {
  proxy: VelocityProxy;
  onDelete: (proxyId: string) => void;
}

export function ProxyCard({ proxy, onDelete }: ProxyCardProps) {
  const getStatusBadgeVariant = (status: VelocityProxy["status"]) => {
    switch (status) {
      case "Online":
        return "default"; // Will use primary color
      case "Offline":
        return "secondary";
      case "Starting":
        return "outline"; // Or another distinct style
      case "Error":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: VelocityProxy["status"]) => {
    switch (status) {
      case "Online":
        return <Power className="h-4 w-4 text-green-500" />;
      case "Offline":
        return <Power className="h-4 w-4 text-muted-foreground" />;
      case "Starting":
        return <Power className="h-4 w-4 text-yellow-500 animate-pulse" />; // Lucide doesn't have specific 'starting' icon
      case "Error":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <Power className="h-4 w-4 text-muted-foreground" />;
    }
  }

  const lastOnline = proxy.lastOnline ? formatDistanceToNow(new Date(proxy.lastOnline), { addSuffix: true }) : 'N/A';

  return (
    <TooltipProvider>
      <Card className="flex flex-col h-full shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <Server className="h-6 w-6 text-primary" />
              {proxy.name}
            </CardTitle>
            <Badge variant={getStatusBadgeVariant(proxy.status)} className="flex items-center gap-1 text-xs">
              {getStatusIcon(proxy.status)}
              {proxy.status}
            </Badge>
          </div>
          <CardDescription>Port: {proxy.port} &bull; Last seen: {lastOnline}</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Cpu className="h-4 w-4" /> CPU Usage
              </span>
              <span>{proxy.cpuUsage}%</span>
            </div>
            <Progress value={proxy.cpuUsage} aria-label={`CPU usage ${proxy.cpuUsage}%`} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <MemoryStick className="h-4 w-4" /> RAM Usage
              </span>
              <span>{proxy.ramUsage}% ({proxy.currentRam}MB / {proxy.maxRam}MB)</span>
            </div>
            <Progress value={proxy.ramUsage} aria-label={`RAM usage ${proxy.ramUsage}%`} />
          </div>
          {proxy.linkedServers.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1 text-muted-foreground">Linked Servers:</h4>
              <div className="flex flex-wrap gap-1">
                {proxy.linkedServers.slice(0,3).map(server => (
                   <Tooltip key={server.id}>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs">{server.name}</Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{server.name} ({server.version}) - {server.status}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {proxy.linkedServers.length > 3 && (
                  <Badge variant="outline" className="text-xs">+{proxy.linkedServers.length - 3} more</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <Separator className="my-2" />
        <CardFooter className="flex justify-end gap-2 pt-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => onDelete(proxy.id)} aria-label={`Delete proxy ${proxy.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Proxy</TooltipContent>
          </Tooltip>
          <Link href={`/proxies/${proxy.id}/edit`} passHref legacyBehavior>
            <Button variant="outline" size="sm" aria-label={`Edit proxy ${proxy.name}`}>
              <Settings2 className="mr-2 h-4 w-4" /> Edit
            </Button>
          </Link>
          <Link href={`/proxies/${proxy.id}/manage`} passHref legacyBehavior>
             <Button size="sm" aria-label={`Manage proxy ${proxy.name}`}>
              <ExternalLink className="mr-2 h-4 w-4" /> Manage
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}
