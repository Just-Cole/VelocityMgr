
"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Download, Star, Eye, AlertTriangle, Wand2, ChevronLeft, ChevronRight, Server } from "lucide-react";
import type { SpigetPlugin, SpigetPluginVersion, GameServer, SpigetSearchResult } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";

export default function PluginBrowserPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const canInstall = user?.permissions?.includes("manage_plugins") || user?.permissions?.includes("install_plugins");
    const [searchQuery, setSearchQuery] = React.useState("");
    const [searchResults, setSearchResults] = React.useState<SpigetPlugin[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    
    // Pagination State
    const [currentPage, setCurrentPage] = React.useState(1);
    const [totalPages, setTotalPages] = React.useState(0);

    // Install Dialog State
    const [showInstallDialog, setShowInstallDialog] = React.useState(false);
    const [selectedPlugin, setSelectedPlugin] = React.useState<SpigetPlugin | null>(null);
    const [isInstalling, setIsInstalling] = React.useState(false);
    
    const [servers, setServers] = React.useState<GameServer[]>([]);
    const [pluginVersions, setPluginVersions] = React.useState<SpigetPluginVersion[]>([]);
    const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);

    const [installTarget, setInstallTarget] = React.useState({
        serverId: "",
        versionId: "",
    });

    const performSearch = React.useCallback(async (query: string, page: number = 1) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/plugins/search?q=${encodeURIComponent(query)}&page=${page}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Failed to search plugins. Status: ${response.status}`);
            }
            const data: SpigetSearchResult = await response.json();
            setSearchResults(data.result || []);
            setCurrentPage(page);

            if (data.pagination && data.pagination.count > 0) {
              setTotalPages(Math.ceil(data.pagination.count / data.pagination.limit));
            } else {
              setTotalPages(0);
            }

            if ((data.result || []).length === 0 && query.trim() !== "" && page === 1) {
                toast({ title: "No Results", description: `No plugins found for "${query}".` });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "An unknown error occurred.";
            setError(msg);
            toast({ title: "Search Error", description: msg, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    const handleSearchSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        performSearch(searchQuery, 1);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            performSearch(searchQuery, newPage);
        }
    };

    React.useEffect(() => {
        performSearch("", 1); // Fetch popular plugins on initial load
    }, [performSearch]);
    
    const fetchServers = React.useCallback(async () => {
        try {
            const res = await fetch("/api/minecraft/servers");
            if (!res.ok) throw new Error("Failed to fetch servers");
            const data: GameServer[] = await res.json();
            // Only list PaperMC servers as targets for Spigot plugins
            setServers(data.filter(s => s.softwareType === 'PaperMC'));
        } catch (err) {
            toast({ title: "Error", description: "Could not load your server list for installation.", variant: "destructive" });
        }
    }, [toast]);
    
    const fetchPluginVersions = React.useCallback(async (plugin: SpigetPlugin) => {
        setIsLoadingDetails(true);
        setPluginVersions([]);
        setInstallTarget(t => ({...t, versionId: ""}));
        try {
            const res = await fetch(`/api/plugins/details?resourceId=${plugin.id}`);
            if (!res.ok) throw new Error("Failed to fetch plugin versions.");
            const data: SpigetPluginVersion[] = await res.json();
            setPluginVersions(data);
             // Auto-select latest version if available
            if (data.length > 0) {
                setInstallTarget(prev => ({...prev, versionId: String(data[0].id)}));
            }
        } catch (err) {
             toast({ title: "Error", description: "Could not load plugin version details.", variant: "destructive" });
        } finally {
             setIsLoadingDetails(false);
        }
    }, [toast]);

    const handleOpenInstallDialog = (plugin: SpigetPlugin) => {
        setSelectedPlugin(plugin);
        setShowInstallDialog(true);
        fetchServers();
        fetchPluginVersions(plugin);
    };
    
    const handleInstall = async () => {
        if (!installTarget.serverId || !installTarget.versionId || !selectedPlugin || !canInstall) return;
        setIsInstalling(true);
        
        const payload = {
            spigetResourceId: selectedPlugin.id,
            spigetVersionId: installTarget.versionId,
            pluginNameForToast: selectedPlugin.name,
        };

        try {
            const response = await fetch(`/api/minecraft/servers/${installTarget.serverId}/plugins/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            toast({ title: "Plugin Installed", description: result.message });
            setShowInstallDialog(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "An unknown error occurred during installation.";
            toast({ title: "Installation Failed", description: msg, variant: "destructive" });
        } finally {
            setIsInstalling(false);
        }
    };


    return (
        <div className="container mx-auto py-2">
            <PageHeader title="Plugin Browser" description="Search for and install plugins from SpigotMC." />
            
            <form onSubmit={handleSearchSubmit} className="mb-8 flex gap-2">
                <Input 
                    type="search"
                    placeholder="Search for plugins like 'EssentialsX', 'LuckPerms'..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-grow"
                />
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Search className="mr-2 h-4 w-4" />
                    Search
                </Button>
            </form>

            {isLoading ? (
                 <div className="flex justify-center items-center py-12">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="ml-4 text-lg">Loading plugins...</p>
                </div>
            ) : error ? (
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : searchResults.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {searchResults.map((plugin) => (
                          <Card key={plugin.id} className="flex flex-col h-full bg-card/50 hover:bg-card/90 transition-colors duration-200">
                              <CardHeader className="flex flex-row items-center gap-4">
                                  <Image src={plugin.icon.url} alt={`${plugin.name} logo`} width={56} height={56} className="rounded-md border" />
                                  <div className="flex-grow">
                                      <CardTitle className="font-bold text-lg">{plugin.name}</CardTitle>
                                      <CardDescription>by {plugin.author?.name || 'Unknown Author'}</CardDescription>
                                  </div>
                              </CardHeader>
                              <CardContent className="flex-grow">
                                  <p className="text-sm text-muted-foreground line-clamp-3 min-h-[4.5rem]">{plugin.tag}</p>
                              </CardContent>
                              <CardFooter className="flex justify-between items-center">
                                  <div className="flex gap-4 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1"><Download className="h-4 w-4" /> {plugin.downloads.toLocaleString()}</span>
                                      <span className="flex items-center gap-1"><Server className="h-4 w-4" /> {plugin.testedVersions.join(', ')}</span>
                                  </div>
                                  {canInstall && (
                                    <Button size="sm" onClick={() => handleOpenInstallDialog(plugin)} className="bg-primary/90 hover:bg-primary">
                                        <Wand2 className="mr-1.5 h-5 w-5" /> Install
                                    </Button>
                                  )}
                              </CardFooter>
                          </Card>
                      ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="mt-8 flex justify-center items-center gap-4">
                        <Button 
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage <= 1 || isLoading}
                            variant="outline"
                        >
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button 
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage >= totalPages || isLoading}
                            variant="outline"
                        >
                            Next
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                  )}
                </>
            ) : (
                <div className="text-center py-12 text-muted-foreground">
                    <p>No plugins found. Try a different search term.</p>
                </div>
            )}
            
            {/* Install Dialog */}
            <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Install Plugin: {selectedPlugin?.name}</DialogTitle>
                  <DialogDescription>Select a server and plugin version to install.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div>
                    <Label htmlFor="install-server">Server</Label>
                    <Select value={installTarget.serverId} onValueChange={(value) => setInstallTarget(prev => ({ ...prev, serverId: value }))}>
                        <SelectTrigger id="install-server">
                            <SelectValue placeholder="Select a PaperMC server" />
                        </SelectTrigger>
                        <SelectContent>
                            {servers.length > 0 ? servers.map(server => (
                                <SelectItem key={server.id} value={server.id}>{server.name} ({server.softwareType})</SelectItem>
                            )) : <p className="p-4 text-sm text-muted-foreground text-center">No PaperMC servers found</p>}
                        </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="install-version">Plugin Version</Label>
                    <Select value={installTarget.versionId} onValueChange={(value) => setInstallTarget(prev => ({...prev, versionId: value}))} disabled={isLoadingDetails}>
                        <SelectTrigger id="install-version">
                            <SelectValue placeholder={isLoadingDetails ? "Loading versions..." : "Select a plugin version"} />
                        </SelectTrigger>
                        <SelectContent>
                            {pluginVersions.map(v => (
                                <SelectItem key={v.id} value={String(v.id)}>
                                    {v.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                  <Button 
                    type="button" 
                    onClick={handleInstall} 
                    disabled={isInstalling || !installTarget.serverId || !installTarget.versionId || !canInstall}
                  >
                    {isInstalling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Install to Server
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

        </div>
    );
}
