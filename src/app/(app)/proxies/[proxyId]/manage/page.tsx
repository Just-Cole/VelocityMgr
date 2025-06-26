
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MOCK_SERVERS } from "@/lib/constants";
import type { GameServer } from "@/lib/types";
import { Loader2, AlertTriangle, Terminal, Users, BarChart2, ShieldCheck, ArrowLeft, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ManageServerPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.proxyId as string; // Use proxyId from route, but name it serverId for internal consistency

  const [server, setServer] = React.useState<GameServer | null>(null);
  const [isFetching, setIsFetching] = React.useState(true);

  React.useEffect(() => {
    setIsFetching(true);
    const foundServer = MOCK_SERVERS.find(p => p.id === serverId);
    setServer(foundServer || null);
    setTimeout(() => setIsFetching(false), 500); 
  }, [serverId]);

  if (isFetching) {
    return (
      <div className="container mx-auto py-8 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading server details...</p>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Error" description="Server not found." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Server Not Found</AlertTitle>
          <AlertDescription>
            The server with ID "{serverId}" could not be found.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const consoleOutput = [
    `[${new Date().toLocaleTimeString()}] Server "${server.name}" started on port ${server.port}`,
    `[${new Date(Date.now() - 5000).toLocaleTimeString()}] Player ExampleUser1 connected from 123.45.67.89`,
    `[${new Date(Date.now() - 2000).toLocaleTimeString()}] Player ExampleUser2 connected from 98.76.54.32`,
    `[${new Date(Date.now() - 1000).toLocaleTimeString()}] INFO: Metrics enabled.`,
  ].join('\n');


  return (
    <div className="container mx-auto py-2">
      <PageHeader title={`Manage Server: ${server.name}`} description={`Advanced management and monitoring for ${server.name}.`}>
        <Button variant="outline" onClick={() => router.push(`/servers/${serverId}/edit`)}>
          <Settings2 className="mr-2 h-4 w-4" /> Edit Configuration
        </Button>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Terminal /> Live Console</CardTitle>
            <CardDescription>View real-time console output from the server. (Read-only)</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="h-64 overflow-y-auto bg-muted/50 p-3 rounded-md text-xs font-code whitespace-pre-wrap">
              {consoleOutput}
            </pre>
            <div className="mt-2 flex gap-2">
              <Input placeholder="Enter command (feature placeholder)" className="flex-grow" disabled />
              <Button disabled>Send</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Users /> Player List</CardTitle>
            <CardDescription>Currently connected players. (Placeholder)</CardDescription>
          </CardHeader>
          <CardContent>
            {server.status === 'Online' ? (
              <ul className="space-y-1 text-sm">
                <li>ExampleUser1</li>
                <li>ExampleUser2</li>
                <li>AnotherPlayer</li>
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">Server is not online. Player list unavailable.</p>
            )}
             <p className="text-xs text-muted-foreground pt-4">Full player management coming soon.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><BarChart2 /> Resource Monitoring</CardTitle>
            <CardDescription>Live CPU, RAM, and Network usage. (Placeholder)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">CPU: {server.cpuUsage}%</p>
            <p className="text-sm">RAM: {server.ramUsage}% ({server.currentRam}MB / {server.maxRam}MB)</p>
            <p className="text-sm">Network: 1.5 Mbps In / 0.8 Mbps Out</p>
            <p className="text-xs text-muted-foreground pt-4">Detailed graphs and historical data coming soon.</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><ShieldCheck /> Security & Firewall</CardTitle>
            <CardDescription>Manage firewall rules and security settings. (Placeholder)</CardDescription>
          </CardHeader>
          <CardContent>
             <p className="text-muted-foreground text-sm">Firewall and advanced security settings will be available here.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">Actions</CardTitle>
            <CardDescription>Control your server instance.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
            <Button className="w-full sm:w-auto" disabled={server.status === 'Online' || server.status === 'Starting'}>Start</Button>
            <Button variant="outline" className="w-full sm:w-auto" disabled={server.status === 'Offline'}>Stop</Button>
            <Button variant="destructive" className="w-full sm:w-auto" disabled={server.status === 'Offline'}>Restart</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
