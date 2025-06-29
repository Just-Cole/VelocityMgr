
"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Convert from 'ansi-to-html';
import Image from 'next/image';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { GameServer, DiagnoseLogsOutput } from "@/lib/types"; 
import { 
  Loader2, 
  AlertTriangle, 
  Terminal, 
  Users, 
  BarChart2, 
  ShieldCheck, 
  ArrowLeft, 
  Settings2, 
  Send, 
  Play, 
  StopCircle, 
  RefreshCcw,
  UserX, // Kick
  ShieldAlert, // Ban
  MessageSquare, // Message
  ListChecks, // For Banned List link
  Cpu,
  MemoryStick,
  ArrowDownCircle,
  ArrowUpCircle,
  Wand2,
  CheckCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { analyzeServerLogs } from "@/actions/diagnostics";

const CONSOLE_POLL_INTERVAL = 1000; // 3 seconds
const SERVER_DATA_POLL_INTERVAL = 1000; // 3 seconds

export default function ManageServerPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.serverId as string; 
  const { toast } = useToast();
  const ansiConverter = React.useMemo(() => new Convert(), []);
  const { user } = useAuth();

  const hasPermission = (p: string) => user?.permissions?.includes(p) ?? false;
  const canViewLogs = hasPermission('view_logs');
  const canSendCommands = hasPermission('send_console_commands');
  const canControlServer = hasPermission('control_servers');
  const canEditConfig = hasPermission('edit_configs');

  const [server, setServer] = React.useState<GameServer | null>(null); 
  const [isFetchingInitialData, setIsFetchingInitialData] = React.useState(true);
  const [apiError, setApiError] = React.useState<string | null>(null);

  const [consoleOutput, setConsoleOutput] = React.useState<string>("");
  const [consoleOffset, setConsoleOffset] = React.useState<number>(0);
  const [commandInput, setCommandInput] = React.useState<string>("");
  const [isSendingCommand, setIsSendingCommand] = React.useState<boolean>(false);
  const consoleEndRef = React.useRef<HTMLDivElement>(null);

  const [isStartingServer, setIsStartingServer] = React.useState(false);
  const [isStoppingServer, setIsStoppingServer] = React.useState(false);
  const [isRestartingServer, setIsRestartingServer] = React.useState(false);
  const isServerActionInProgress = isStartingServer || isStoppingServer || isRestartingServer;

  // State for player action dialogs
  const [showKickDialog, setShowKickDialog] = React.useState(false);
  const [playerToKick, setPlayerToKick] = React.useState<string | null>(null);
  const [showBanDialog, setShowBanDialog] = React.useState(false);
  const [playerToBan, setPlayerToBan] = React.useState<string | null>(null);
  const [showMsgDialog, setShowMsgDialog] = React.useState(false);
  const [playerToMsg, setPlayerToMsg] = React.useState<string | null>(null);
  const [messageText, setMessageText] = React.useState("");

  // State for AI Analysis
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisResult, setAnalysisResult] = React.useState<DiagnoseLogsOutput | null>(null);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);


  const fetchServerData = React.useCallback(async (showLoadingIndicator = true) => {
    if (!serverId) {
      if (showLoadingIndicator) setIsFetchingInitialData(false);
      setApiError("Server ID is missing from the URL.");
      return;
    }
    if (showLoadingIndicator) setIsFetchingInitialData(true);
    setApiError(null);

    try {
      const response = await fetch("/api/minecraft/servers");
      if (!response.ok) {
        let errorDetail = `Server responded with status ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetail = errorData.message || errorDetail;
        } catch (e) {
           errorDetail = (await response.text()) || errorDetail;
        }
        throw new Error(`Failed to fetch server list: ${errorDetail}`);
      }
      const allServers: GameServer[] = await response.json();
      const foundServer = allServers.find(s => s.id === serverId);

      if (foundServer) {
        setServer(foundServer);
      } else {
        setServer(null);
        setApiError(`Server with ID "${serverId}" not found in API response.`);
      }
    } catch (err) {
      console.error("Error fetching server data:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while fetching server data.";
      setApiError(errorMessage);
      setServer(null);
      if (showLoadingIndicator) { 
        toast({
          title: "Error Loading Server",
          description: errorMessage.substring(0,100),
          variant: "destructive",
        });
      }
    } finally {
      if (showLoadingIndicator) setIsFetchingInitialData(false);
    }
  }, [serverId, toast]);

  React.useEffect(() => {
    fetchServerData(true); 
    const intervalId = setInterval(() => fetchServerData(false), SERVER_DATA_POLL_INTERVAL); 
    return () => clearInterval(intervalId);
  }, [fetchServerData]);


  const fetchConsoleLogs = React.useCallback(async () => {
    if (!canViewLogs || !server || !serverId || (server.status !== 'Online' && server.status !== 'Starting' && server.status !== 'Restarting')) {
      if (consoleOutput !== "" && (server?.status === 'Offline' || server?.status === 'Stopping' || server?.status === 'Error')) {
        const inactiveMessageHtml = ansiConverter.toHtml(`\n--- Server is ${server.status}. Console inactive. ---\n`);
        setConsoleOutput(prev => prev.endsWith(inactiveMessageHtml) ? prev : prev + inactiveMessageHtml);
      }
      return;
    }
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/console/stream?offset=${consoleOffset}`);
      if (!response.ok) {
        console.error(`Console poll failed: ${response.status}`);
        if(response.status === 404){ 
            setServer(prev => prev ? {...prev, status: 'Offline'} : null);
            setConsoleOutput(prev => prev + ansiConverter.toHtml("\n--- Server appears to have gone offline unexpectedly. ---\n"));
        }
        return;
      }
      const data = await response.json();
      if (data.logs) {
        setConsoleOutput(prev => prev + ansiConverter.toHtml(data.logs));
      }
      setConsoleOffset(data.newOffset);
      if (server && server.status !== data.status) { 
        setServer(prev => prev ? {...prev, status: data.status as GameServer['status']} : null);
      }
    } catch (error) {
      console.error("Error fetching console logs:", error);
    }
  }, [serverId, consoleOffset, server, consoleOutput, ansiConverter, canViewLogs]);

  React.useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (canViewLogs && server && (server.status === 'Online' || server.status === 'Starting' || server.status === 'Restarting')) {
      fetchConsoleLogs(); 
      intervalId = setInterval(fetchConsoleLogs, CONSOLE_POLL_INTERVAL);
    } else if (canViewLogs && server && (server.status === 'Offline' || server.status === 'Error' || server.status === 'Stopping')) {
        const inactiveMessage = `--- Server is ${server.status}. Console inactive. ---\n`;
        const inactiveMessageHtml = ansiConverter.toHtml(inactiveMessage);
        if (!consoleOutput.endsWith(inactiveMessageHtml)) {
             setConsoleOutput(prev => {
                if (prev.includes("starting at") && server.status === 'Starting') return prev;
                if (prev.includes("stopping at") && server.status === 'Stopping') return prev;
                return prev + inactiveMessageHtml;
             });
        }
    }
    return () => clearInterval(intervalId);
  }, [server, fetchConsoleLogs, consoleOutput, ansiConverter, canViewLogs]);

  React.useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [consoleOutput]);

  const handleSendCommand = async (commandToSend?: string) => {
    const finalCommand = commandToSend || commandInput;
    if (!finalCommand.trim() || !server || !serverId || isSendingCommand || isServerActionInProgress || !canSendCommands) return;

    setIsSendingCommand(true);
    setConsoleOutput(prev => prev + ansiConverter.toHtml(`> ${finalCommand}\n`));
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: finalCommand }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to send command. Status: ${response.status}`);
      }
      if (!commandToSend) setCommandInput(""); // Clear input only if it was from the main input field
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: "Error Sending Command", description: errorMessage, variant: "destructive" });
      console.error("Error sending command:", error);
      setConsoleOutput(prev => prev + ansiConverter.toHtml(`SYSTEM: Error sending command: ${errorMessage}\n`));
    } finally {
      setIsSendingCommand(false);
    }
  };
  
  const canSendCommandNow = server && (server.status === 'Online' || server.status === 'Starting' || server.status === 'Restarting') && canSendCommands;

  const serverAction = async (
    actionType: 'start' | 'stop' | 'restart',
    setLoadingState: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!server || !canControlServer) return;
    setLoadingState(true);
    if (actionType === 'start' || actionType === 'restart') {
      setConsoleOutput(ansiConverter.toHtml(`--- Attempting to ${actionType} server ${server.name}... ---\n`));
      setConsoleOffset(0);
    } else if (actionType === 'stop') {
       setConsoleOutput(prev => prev + ansiConverter.toHtml(`--- Attempting to stop server ${server.name}... ---\n`));
    }
    try {
      const response = await fetch(`/api/minecraft/${actionType}`, {
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
        throw new Error(data.message || `Failed to ${actionType} server. Status: ${response.status}`);
      }
      if (data.server) {
        setServer(data.server); 
      } else {
        const optimisticStatusMap = {
          start: 'Starting',
          stop: 'Stopping',
          restart: 'Restarting',
        } as const;
        setServer(prev => prev ? { ...prev, status: optimisticStatusMap[actionType] as GameServer['status'] } : null);
        fetchServerData(false); 
      }
      toast({ title: `Server ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`, description: data.message });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `An unknown error occurred during ${actionType}.`;
      toast({ title: `Error ${actionType} Server`, description: errorMessage, variant: "destructive" });
      console.error(`Error ${actionType} server:`, error);
      fetchServerData(false); 
    } finally {
      setLoadingState(false);
    }
  };

  const handleStartServer = () => serverAction('start', setIsStartingServer);
  const handleStopServer = () => serverAction('stop', setIsStoppingServer);
  const handleRestartServer = () => serverAction('restart', setIsRestartingServer);

  // Player action handlers
  const handleKickPlayer = (playerName: string) => {
    if (!canSendCommands) return;
    setPlayerToKick(playerName);
    setShowKickDialog(true);
  };
  const confirmKickPlayer = async () => {
    if (!playerToKick) return;
    await handleSendCommand(`kick ${playerToKick} Kicked by panel`);
    toast({ title: "Kick Command Sent", description: `Attempting to kick ${playerToKick}.`});
    setShowKickDialog(false);
    setPlayerToKick(null);
  };

  const handleBanPlayer = (playerName: string) => {
    if (!canSendCommands) return;
    setPlayerToBan(playerName);
    setShowBanDialog(true);
  };
  const confirmBanPlayer = async () => {
    if (!playerToBan) return;
    await handleSendCommand(`ban ${playerToBan} Banned by panel`);
    toast({ title: "Ban Command Sent", description: `Attempting to ban ${playerToBan}.`});
    setShowBanDialog(false);
    setPlayerToBan(null);
  };

  const handleMessagePlayer = (playerName: string) => {
    if (!canSendCommands) return;
    setPlayerToMsg(playerName);
    setMessageText("");
    setShowMsgDialog(true);
  };
  const confirmSendMessage = async () => {
    if (!playerToMsg || !messageText.trim()) return;
    await handleSendCommand(`msg ${playerToMsg} ${messageText.trim()}`);
    toast({ title: "Message Sent", description: `Message sent to ${playerToMsg}.`});
    setShowMsgDialog(false);
    setPlayerToMsg(null);
    setMessageText("");
  };

  const handleAnalyzeLogs = async () => {
    if (!server || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisError(null);

    const result = await analyzeServerLogs({ serverId: server.id });

    if ('error' in result) {
      if (result.error.includes("CONSUMER_SUSPENDED")) {
        setAnalysisError("The AI analysis service is temporarily unavailable. This is likely due to an issue with the API key configuration or billing. Please contact the administrator.");
      } else {
        setAnalysisError(result.error);
      }
    } else {
      setAnalysisResult(result);
    }

    setIsAnalyzing(false);
  };

  if (isFetchingInitialData) {
    return (
      <div className="container mx-auto py-8 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading server details...</p>
      </div>
    );
  }
  
  if (!server && apiError) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Error" description="Failed to load server details." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Server</AlertTitle>
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!server) { 
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Server Not Found" description={`A server with ID "${serverId}" could not be loaded.`} />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Server Not Found</AlertTitle>
          <AlertDescription>
            The server details could not be loaded. It may have been deleted or the ID is incorrect.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }
  
  const currentServerStatus = server?.status || 'Offline';
  const consolePlaceholderHtml = ansiConverter.toHtml("--- Waiting for console output... Server might be offline or starting. ---");


  return (
    <div className="container mx-auto py-2">
      <PageHeader title={`Manage Server: ${server.name}`} description={`Advanced management and monitoring for ${server.name}. Status: ${currentServerStatus}`}>
        {canEditConfig && (
        <Button variant="outline" onClick={() => router.push(`/servers/${serverId}/edit`)} disabled={isServerActionInProgress}>
          <Settings2 className="mr-2 h-4 w-4" /> Edit Configuration
        </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {canViewLogs ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><Terminal /> Live Console</CardTitle>
              <CardDescription>View real-time console output from the server.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 border rounded-md bg-muted/50">
                <pre 
                  className="p-3 text-xs font-code whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: consoleOutput || consolePlaceholderHtml }}
                />
                <div ref={consoleEndRef} />
              </ScrollArea>
              <form onSubmit={(e) => { e.preventDefault(); handleSendCommand(); }} className="mt-2 flex gap-2">
                <Input 
                  placeholder={canSendCommandNow ? "Enter command..." : "Console unavailable"} 
                  className="flex-grow" 
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  disabled={!canSendCommandNow || isSendingCommand || isServerActionInProgress}
                />
                <Button type="submit" disabled={!canSendCommandNow || isSendingCommand || !commandInput.trim() || isServerActionInProgress}>
                  {isSendingCommand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" /> }
                  Send
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Console</CardTitle>
              <CardDescription>You do not have permission to view server logs.</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Users /> Player List</CardTitle>
            <CardDescription>Currently connected players.</CardDescription>
          </CardHeader>
          <CardContent>
            {currentServerStatus === 'Online' && server.connectedPlayers && server.connectedPlayers.length > 0 ? (
              <ScrollArea className="h-40">
                <ul className="space-y-2">
                  {server.connectedPlayers.map((player, index) => (
                    <li key={index} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex items-center gap-2">
                        <Image 
                          src={`https://starlightskins.lunareclipse.studio/render/wallpaper/off_to_the_stars/${player}`} 
                          alt={`${player}'s wallpaper`}
                          width={32}
                          height={32}
                          className="rounded"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/32x32.png'; (e.target as HTMLImageElement).alt = 'Default player image'; }}
                        />
                        <span className="text-sm">{player}</span>
                      </div>
                      {canSendCommands && (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleMessagePlayer(player)} title={`Message ${player}`} disabled={!canSendCommandNow || isServerActionInProgress}>
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleKickPlayer(player)} title={`Kick ${player}`} disabled={!canSendCommandNow || isServerActionInProgress}>
                            <UserX className="h-4 w-4 text-orange-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleBanPlayer(player)} title={`Ban ${player}`} disabled={!canSendCommandNow || isServerActionInProgress}>
                            <ShieldAlert className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : currentServerStatus === 'Online' && (!server.connectedPlayers || server.connectedPlayers.length === 0) ? (
              <p className="text-muted-foreground text-sm">No players currently online.</p>
            ) : (
              <p className="text-muted-foreground text-sm">Server is not online. Player list unavailable.</p>
            )}
             {currentServerStatus !== 'Online' && <p className="text-xs text-muted-foreground pt-4">Player list updates when server is Online.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><BarChart2 /> Resource Monitoring</CardTitle>
            <CardDescription>Live CPU and RAM usage.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu className="h-6 w-6 text-muted-foreground" />
                <span className="font-medium">CPU Usage</span>
              </div>
              <span className="font-mono text-lg">{server.cpuUsage ?? 0}%</span>
            </div>
            <Progress value={server.cpuUsage ?? 0} aria-label={`${server.cpuUsage ?? 0}% CPU usage`} />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MemoryStick className="h-6 w-6 text-muted-foreground" />
                <span className="font-medium">RAM Usage</span>
              </div>
              <span className="font-mono text-lg">{server.currentRam || 0}MB / {server.maxRam}</span>
            </div>
            <Progress value={server.ramUsage ?? 0} aria-label={`${server.ramUsage ?? 0}% RAM usage`} />
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                    <Wand2 /> AI Log Analysis
                </CardTitle>
                <CardDescription>
                    Let AI analyze your server logs to find critical errors and suggest solutions.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button 
                    className="w-full" 
                    onClick={handleAnalyzeLogs} 
                    disabled={isAnalyzing}
                >
                    {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Analyze Server Logs
                </Button>
            </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">Actions</CardTitle>
            <CardDescription>Control your server instance.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
            <Button 
              className="w-full sm:w-auto" 
              onClick={handleStartServer}
              disabled={isServerActionInProgress || !canControlServer || currentServerStatus === 'Online' || currentServerStatus === 'Starting' || currentServerStatus === 'Restarting'}
            >
              {isStartingServer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start
            </Button>
            <Button 
              variant="outline" 
              className="w-full sm:w-auto" 
              onClick={handleStopServer}
              disabled={isServerActionInProgress || !canControlServer || currentServerStatus === 'Offline' || currentServerStatus === 'Stopping'}
            >
              {isStoppingServer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <StopCircle className="mr-2 h-4 w-4" />}
              Stop
            </Button>
            <Button 
              variant="destructive" 
              className="w-full sm:w-auto" 
              onClick={handleRestartServer}
              disabled={isServerActionInProgress || !canControlServer || currentServerStatus === 'Offline' || currentServerStatus === 'Stopping'}
            >
              {isRestartingServer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Restart
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Kick Player Dialog */}
      {playerToKick && (
        <AlertDialog open={showKickDialog} onOpenChange={setShowKickDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kick Player: {playerToKick}?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to kick {playerToKick} from the server? They will be able to rejoin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPlayerToKick(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmKickPlayer} disabled={isSendingCommand}>
                {isSendingCommand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Kick Player
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Ban Player Dialog */}
      {playerToBan && (
        <AlertDialog open={showBanDialog} onOpenChange={setShowBanDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ban Player: {playerToBan}?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently ban {playerToBan} from the server?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPlayerToBan(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmBanPlayer} disabled={isSendingCommand} className="bg-destructive hover:bg-destructive/90">
                {isSendingCommand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ban Player
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Message Player Dialog */}
      {playerToMsg && (
        <Dialog open={showMsgDialog} onOpenChange={(isOpen) => {
          setShowMsgDialog(isOpen);
          if (!isOpen) setPlayerToMsg(null);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Message Player: {playerToMsg}</DialogTitle>
              <DialogDescription>Enter the message you want to send to {playerToMsg}.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Textarea 
                id="messageText" 
                value={messageText} 
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type your message here..." 
                rows={3}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="button" onClick={confirmSendMessage} disabled={isSendingCommand || !messageText.trim()}>
                {isSendingCommand ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send Message
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* AI Analysis Result Dialog */}
      <Dialog open={!!analysisResult || !!analysisError} onOpenChange={() => { setAnalysisResult(null); setAnalysisError(null); }}>
        <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Wand2 /> Log Analysis Report
                </DialogTitle>
                <DialogDescription>
                    AI-powered diagnosis of your server logs.
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-4">
              {isAnalyzing && (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-4">Analyzing logs, please wait...</p>
                </div>
              )}
              {analysisResult && (
                  analysisResult.hasError ? (
                      <>
                          <Alert variant="destructive">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertTitle>Error Found: {analysisResult.errorSummary}</AlertTitle>
                          </Alert>
                          <div>
                              <h3 className="font-semibold mb-2">Possible Cause</h3>
                              <p className="text-sm text-muted-foreground">{analysisResult.possibleCause}</p>
                          </div>
                          <div>
                              <h3 className="font-semibold mb-2">Suggested Fix</h3>
                              <div className="prose prose-sm dark:prose-invert bg-muted/50 p-3 rounded-md">
                                  <pre className="text-sm whitespace-pre-wrap font-sans bg-transparent p-0 border-0">{analysisResult.suggestedFix}</pre>
                              </div>
                          </div>
                      </>
                  ) : (
                       <Alert>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <AlertTitle>No Critical Errors Found</AlertTitle>
                          <AlertDescription>{analysisResult.errorSummary}</AlertDescription>
                      </Alert>
                  )
              )}
              {analysisError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Analysis Failed</AlertTitle>
                    <AlertDescription>{analysisError}</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline">Close</Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
