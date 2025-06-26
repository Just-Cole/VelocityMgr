"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { MOCK_PROXIES, MOCK_TEMPLATES } from "@/lib/constants";
import type { VelocityProxy, PaperMCServer, ProxyTemplate } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, ServerIcon, Puzzle, FileText, AlertTriangle, Trash2, PlusCircle } from "lucide-react";
import { ConfigCodeBlock } from "@/components/config-code-block";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function EditProxyPage() {
  const router = useRouter();
  const params = useParams();
  const proxyId = params.proxyId as string;
  const { toast } = useToast();

  const [proxy, setProxy] = React.useState<VelocityProxy | null>(null);
  const [template, setTemplate] = React.useState<ProxyTemplate | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFetching, setIsFetching] = React.useState(true);

  // Form states for editable fields
  const [proxyName, setProxyName] = React.useState("");
  const [proxyPort, setProxyPort] = React.useState<number | string>("");
  const [velocityConfig, setVelocityConfig] = React.useState("");
  // For simplicity, PaperMC config and plugins are not directly editable via text area in this iteration
  // but shown via template. A real app would have more granular controls.
  const [linkedServers, setLinkedServers] = React.useState<PaperMCServer[]>([]);


  React.useEffect(() => {
    setIsFetching(true);
    // Simulate fetching proxy data
    const foundProxy = MOCK_PROXIES.find(p => p.id === proxyId);
    if (foundProxy) {
      setProxy(foundProxy);
      setProxyName(foundProxy.name);
      setProxyPort(foundProxy.port);
      setLinkedServers(foundProxy.linkedServers);

      if (foundProxy.templateId) {
        const foundTemplate = MOCK_TEMPLATES.find(t => t.id === foundProxy.templateId);
        if (foundTemplate) {
          setTemplate(foundTemplate);
          setVelocityConfig(foundTemplate.velocityConfig);
        } else {
          // Fallback if template not found but ID exists
           setVelocityConfig(`# Template ${foundProxy.templateId} not found. Displaying raw or default config might be an option here.`);
        }
      } else {
        // If no template, provide a basic editable field or message
        setVelocityConfig(`# No template linked. Basic Velocity config for ${foundProxy.name}:\nbind = "0.0.0.0:${foundProxy.port}"\nmotd = "A Velocity Server"`);
      }

    }
    // Simulate fetch delay
    setTimeout(() => setIsFetching(false), 500);
  }, [proxyId]);

  const handleSaveChanges = async () => {
    if (!proxy) return;
    setIsLoading(true);
    // Simulate API call
    console.log("Saving changes for proxy:", proxy.id, { name: proxyName, port: proxyPort, velocityConfig });
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast({
      title: "Changes Saved",
      description: `Configuration for proxy "${proxyName}" has been updated.`,
    });
    setIsLoading(false);
    // Optionally, refetch data or update local state more formally
  };
  
  const handleAddServer = () => {
    // Mock adding a server
    const newServer: PaperMCServer = {
      id: `server-${Date.now()}`,
      name: `New Server ${linkedServers.length + 1}`,
      status: 'Offline',
      version: '1.20.4',
      ram: '1GB'
    };
    setLinkedServers(prev => [...prev, newServer]);
    toast({title: "Server Added", description: `${newServer.name} added to proxy.`});
  };

  const handleDeleteServer = (serverId: string) => {
    setLinkedServers(prev => prev.filter(s => s.id !== serverId));
    toast({title: "Server Removed", description: `Server removed from proxy.`});
  };


  if (isFetching) {
    return (
      <div className="container mx-auto py-8 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading proxy configuration...</p>
      </div>
    );
  }

  if (!proxy) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Error" description="Proxy not found." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Proxy Not Found</AlertTitle>
          <AlertDescription>
            The proxy with ID "{proxyId}" could not be found. It may have been deleted or the ID is incorrect.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <PageHeader title={`Edit Proxy: ${proxy.name}`} description={`Manage configuration for ${proxy.name} (ID: ${proxy.id}).`}>
        <Button onClick={handleSaveChanges} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </PageHeader>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-4">
          <TabsTrigger value="general">General Settings</TabsTrigger>
          <TabsTrigger value="velocity-config">Velocity Config</TabsTrigger>
          <TabsTrigger value="papermc-servers">PaperMC Servers</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">General Information</CardTitle>
              <CardDescription>Basic settings for your proxy instance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="proxyName">Proxy Name</Label>
                <Input id="proxyName" value={proxyName} onChange={(e) => setProxyName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="proxyPort">Port Number</Label>
                <Input id="proxyPort" type="number" value={proxyPort} onChange={(e) => setProxyPort(parseInt(e.target.value,10) || "")} className="mt-1" />
              </div>
              {template && (
                <div>
                  <Label>Base Template</Label>
                  <p className="text-sm text-muted-foreground mt-1 p-2 border rounded-md bg-muted/50">{template.name} - <i>{template.description}</i></p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="velocity-config">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><FileText /> Velocity Configuration (velocity.toml)</CardTitle>
              <CardDescription>
                {template ? `Based on template: ${template.name}. ` : ""}
                Edit the core Velocity configuration file. Advanced users only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={velocityConfig}
                onChange={(e) => setVelocityConfig(e.target.value)}
                rows={20}
                className="font-code text-xs leading-relaxed bg-background"
                placeholder="Enter Velocity configuration here..."
              />
            </CardContent>
             <CardFooter>
                <p className="text-xs text-muted-foreground">Changes to this file require a proxy restart to take effect.</p>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="papermc-servers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-headline flex items-center gap-2"><ServerIcon /> Linked PaperMC Servers</CardTitle>
                <CardDescription>Manage backend PaperMC servers connected to this proxy.</CardDescription>
              </div>
              <Button size="sm" onClick={handleAddServer}><PlusCircle className="mr-2 h-4 w-4" />Add Server</Button>
            </CardHeader>
            <CardContent>
              {linkedServers.length > 0 ? (
                <ScrollArea className="h-[300px] pr-3">
                  <ul className="space-y-3">
                    {linkedServers.map(server => (
                      <li key={server.id} className="flex items-center justify-between p-3 border rounded-md bg-muted/20 hover:bg-muted/40 transition-colors">
                        <div>
                          <p className="font-medium">{server.name} <span className={`text-xs px-1.5 py-0.5 rounded-full ${server.status === 'Online' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-500/20 text-red-700 dark:text-red-400'}`}>{server.status}</span></p>
                          <p className="text-xs text-muted-foreground">Version: {server.version} | RAM: {server.ram}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteServer(server.id)} aria-label={`Remove server ${server.name}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : (
                <p className="text-muted-foreground text-center py-4">No PaperMC servers linked to this proxy.</p>
              )}
            </CardContent>
          </Card>
          {template && template.paperConfig && (
            <div className="mt-4">
              <ConfigCodeBlock title="Default PaperMC Config (from Template)" code={template.paperConfig} language="properties" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="plugins">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2"><Puzzle /> Plugin Management</CardTitle>
              <CardDescription>
                {template ? `Default plugins from template "${template.name}": ${template.plugins.join(', ') || 'None'}. ` : ""}
                Manage Velocity and backend server plugins. (Feature placeholder)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Feature Under Development</AlertTitle>
                <AlertDescription>
                  Advanced plugin management (install, uninstall, configure) will be available in a future update.
                  Currently, plugins are typically managed via the template or direct file access.
                </AlertDescription>
              </Alert>
               {template && template.plugins.length > 0 && (
                 <div className="mt-4">
                    <h4 className="font-medium mb-2">Template Plugins:</h4>
                    <ul className="list-disc list-inside pl-2 space-y-1 text-sm">
                        {template.plugins.map(plugin => <li key={plugin}>{plugin}</li>)}
                    </ul>
                 </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
