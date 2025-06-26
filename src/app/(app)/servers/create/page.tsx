
"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Upload, Search, Package, Server, CheckCircle, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import type { ModrinthProject, ModrinthVersion } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { getRamSuggestion } from '@/actions/modpack';

const RAM_OPTIONS = [
  { value: "512M", label: "512 MB" },
  { value: "1024M", label: "1 GB" },
  { value: "2048M", label: "2 GB" },
  { value: "3072M", label: "3 GB" },
  { value: "4096M", label: "4 GB" },
  { value: "6144M", label: "6 GB" },
  { value: "8192M", label: "8 GB" },
  { value: "10240M", label: "10 GB" },
  { value: "12288M", label: "12 GB" },
  { value: "16384M", label: "16 GB" },
];

const serverSchema = z.object({
  networkSetupType: z.enum(["single_server", "upload_zip", "modpack"]).default("single_server"),
  name: z.string().optional(),
  networkName: z.string().optional(),
  port: z.coerce.number().optional(),
  serverType: z.enum(["PaperMC", "Velocity"]).optional(),
  version: z.string().optional(),
  paperBuild: z.string().optional(),
  velocityVersion: z.string().optional(),
  velocityBuild: z.string().optional(),

  serverZip: z.any().optional(),
  jarFileName: z.string().optional(),
  minRam: z.string().optional(),
  maxRam: z.string().optional(),
  description: z.string().optional(),

  // Modpack fields
  modpackVersionId: z.string().optional(),
  modpackProjectId: z.string().optional(),

}).superRefine((data, ctx) => {
  if (data.networkSetupType === "single_server") {
    if (!data.name || data.name.length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Server name must be at least 3 characters", path: ["name"] });
    if (data.port === undefined || data.port < 1024 || data.port > 65535) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Port must be between 1024 and 65535", path: ["port"] });
    if (!data.serverType) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Please select a server type", path: ["serverType"] });
    if (data.serverType === "PaperMC") {
      if (!data.version) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Minecraft version is required for PaperMC", path: ["version"] });
      if (!data.paperBuild) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Paper build is required for PaperMC", path: ["paperBuild"] });
    } else if (data.serverType === "Velocity") {
      if (!data.velocityVersion) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Velocity version is required", path: ["velocityVersion"] });
      if (!data.velocityBuild) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Velocity build is required", path: ["velocityBuild"] });
    }
  } else if (data.networkSetupType === "upload_zip") {
    if (!data.name || data.name.length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Server name must be at least 3 characters", path: ["name"] });
    if (data.port === undefined || data.port < 1024 || data.port > 65535) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Port must be between 1024 and 65535", path: ["port"] });
    if (!data.jarFileName || !data.jarFileName.endsWith('.jar')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A valid .jar file name is required (e.g., server.jar)", path: ["jarFileName"] });
    if (!data.minRam) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Min RAM is required", path: ["minRam"] });
    if (!data.maxRam) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Max RAM is required", path: ["maxRam"] });
    if (!data.serverZip || data.serverZip.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A .zip file is required for upload.", path: ["serverZip"] });
  } else if (data.networkSetupType === "modpack") {
    if (!data.name || data.name.length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Server name must be at least 3 characters", path: ["name"] });
    if (data.port === undefined || data.port < 1024 || data.port > 65535) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Port must be between 1024 and 65535", path: ["port"] });
    if (!data.minRam) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Min RAM is required", path: ["minRam"] });
    if (!data.maxRam) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Max RAM is required", path: ["maxRam"] });
    if (!data.modpackProjectId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "You must select a modpack.", path: ["modpackProjectId"] });
    if (!data.modpackVersionId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "You must select a modpack version.", path: ["modpackVersionId"] });
  }
});

type ServerFormData = z.infer<typeof serverSchema>;

interface ApiVersionResponse {
  project_id: string;
  project_name: string;
  version_groups: string[];
  versions: string[];
}

interface ApiBuildsResponse {
  project_id: string;
  project_name: string;
  version: string;
  builds: { build: number }[];
}

export default function CreateServerPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const { user } = useAuth();
  const canCreate = user?.permissions?.includes('create_servers');

  const [minecraftVersions, setMinecraftVersions] = React.useState<string[]>([]);
  const [paperBuilds, setPaperBuilds] = React.useState<number[]>([]);
  const [latestPaperBuildNumber, setLatestPaperBuildNumber] = React.useState<number | null>(null);
  const [isLoadingMinecraftVersions, setIsLoadingMinecraftVersions] = React.useState(false);
  const [isLoadingPaperBuilds, setIsLoadingPaperBuilds] = React.useState(false);
  const [fullPaperVersion, setFullPaperVersion] = React.useState<string | null>(null);

  const [velocityVersions, setVelocityVersions] = React.useState<string[]>([]);
  const [velocityBuilds, setVelocityBuilds] = React.useState<number[]>([]);
  const [latestVelocityBuildNumber, setLatestVelocityBuildNumber] = React.useState<number | null>(null);
  const [isLoadingVelocityVersions, setIsLoadingVelocityVersions] = React.useState(false);
  const [isLoadingVelocityBuilds, setIsLoadingVelocityBuilds] = React.useState(false);
  const [fullVelocityVersion, setFullVelocityVersion] = React.useState<string | null>(null);
  
  // Modpack state
  const [modpackSearchQuery, setModpackSearchQuery] = React.useState("");
  const [modpackResults, setModpackResults] = React.useState<ModrinthProject[]>([]);
  const [isSearchingModpacks, setIsSearchingModpacks] = React.useState(false);
  const [selectedModpack, setSelectedModpack] = React.useState<ModrinthProject | null>(null);
  const [modpackVersions, setModpackVersions] = React.useState<ModrinthVersion[]>([]);
  const [isLoadingModpackVersions, setIsLoadingModpackVersions] = React.useState(false);
  const [isSuggestingRam, setIsSuggestingRam] = React.useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    resetField,
    register,
    reset,
  } = useForm<ServerFormData>({
    resolver: zodResolver(serverSchema),
    defaultValues: {
      networkSetupType: "single_server",
      name: "",
      port: 25565,
      serverType: "PaperMC",
      version: "",
      paperBuild: "",
      velocityVersion: "",
      velocityBuild: "",
      jarFileName: "server.jar",
      minRam: "1024M",
      maxRam: "2048M",
    },
  });

  const selectedNetworkSetupType = watch("networkSetupType");
  const selectedServerType = watch("serverType");
  const selectedMinecraftVersion = watch("version");
  const selectedVelocityVersion = watch("velocityVersion");

  // Fetch PaperMC versions
  React.useEffect(() => {
    if (selectedNetworkSetupType !== "single_server" || selectedServerType !== "PaperMC" || minecraftVersions.length > 0) return;

    const fetchMcVersions = async () => {
      setIsLoadingMinecraftVersions(true);
      try {
        const response = await fetch('/api/papermc/versions/paper');
        if (!response.ok) throw new Error('Failed to fetch PaperMC versions');
        const data: ApiVersionResponse = await response.json();
        setMinecraftVersions(data.versions.reverse() || []);
      } catch (err) {
        toast({ title: "Error", description: "Could not load PaperMC versions.", variant: "destructive" });
        setMinecraftVersions([]);
      } finally {
        setIsLoadingMinecraftVersions(false);
      }
    };
    fetchMcVersions();
  }, [selectedNetworkSetupType, selectedServerType, minecraftVersions.length, toast]);

  // Fetch PaperMC builds when a version is selected
  React.useEffect(() => {
    if (selectedNetworkSetupType !== "single_server" || selectedServerType !== "PaperMC" || !selectedMinecraftVersion) {
        setPaperBuilds([]);
        setFullPaperVersion(null);
        return;
    };

    const fetchPaperBuilds = async () => {
      setIsLoadingPaperBuilds(true);
      resetField("paperBuild");
      setPaperBuilds([]);
      setFullPaperVersion(null);
      try {
        const response = await fetch(`/api/papermc/builds/paper/${selectedMinecraftVersion}`);
        if (!response.ok) throw new Error(`Failed to fetch builds for version ${selectedMinecraftVersion}`);
        const data: ApiBuildsResponse = await response.json();
        const builds = (data.builds || []).map(b => b.build).reverse();
        setPaperBuilds(builds);
        setFullPaperVersion(data.version);
        if (builds.length > 0) {
            const latestBuild = builds[0];
            setLatestPaperBuildNumber(latestBuild);
            setValue("paperBuild", String(latestBuild));
        }
      } catch (err) {
        toast({ title: "Error", description: "Could not load Paper builds for the selected version.", variant: "destructive" });
        setPaperBuilds([]);
      } finally {
        setIsLoadingPaperBuilds(false);
      }
    };
    fetchPaperBuilds();
  }, [selectedNetworkSetupType, selectedServerType, selectedMinecraftVersion, resetField, setValue, toast]);


  // Fetch Velocity versions
  React.useEffect(() => {
    if (selectedNetworkSetupType !== "single_server" || selectedServerType !== "Velocity" || velocityVersions.length > 0) return;

    const fetchVeloVersions = async () => {
      setIsLoadingVelocityVersions(true);
      try {
        const response = await fetch('/api/papermc/versions/velocity');
        if (!response.ok) throw new Error('Failed to fetch Velocity versions');
        const data: ApiVersionResponse = await response.json();
        setVelocityVersions(data.versions.reverse() || []);
      } catch (err) {
        toast({ title: "Error", description: "Could not load Velocity versions.", variant: "destructive" });
        setVelocityVersions([]);
      } finally {
        setIsLoadingVelocityVersions(false);
      }
    };
    fetchVeloVersions();
  }, [selectedNetworkSetupType, selectedServerType, velocityVersions.length, toast]);


  // Fetch Velocity builds when a version is selected
  React.useEffect(() => {
    if (selectedNetworkSetupType !== "single_server" || selectedServerType !== "Velocity" || !selectedVelocityVersion) {
        setVelocityBuilds([]);
        return;
    };

    const fetchVelocityBuilds = async () => {
      setIsLoadingVelocityBuilds(true);
      resetField("velocityBuild");
      setVelocityBuilds([]);
      setFullVelocityVersion(null);
      try {
        const response = await fetch(`/api/papermc/builds/velocity/${selectedVelocityVersion}`);
        if (!response.ok) throw new Error(`Failed to fetch builds for Velocity version ${selectedVelocityVersion}`);
        const data: ApiBuildsResponse = await response.json();
        const builds = (data.builds || []).map(b => b.build).reverse();
        setVelocityBuilds(builds);
        setFullVelocityVersion(data.version);
        if (builds.length > 0) {
            const latestBuild = builds[0];
            setLatestVelocityBuildNumber(latestBuild);
            setValue("velocityBuild", String(latestBuild));
        }
      } catch (err) {
        toast({ title: "Error", description: "Could not load Velocity builds for the selected version.", variant: "destructive" });
        setVelocityBuilds([]);
      } finally {
        setIsLoadingVelocityBuilds(false);
      }
    };
    fetchVelocityBuilds();
  }, [selectedNetworkSetupType, selectedServerType, selectedVelocityVersion, resetField, setValue, toast]);
  
  const handleSetupTypeChange = (value: string) => {
    const currentValues = watch();
    reset({
      ...currentValues,
      networkSetupType: value as ServerFormData['networkSetupType'],
    });
  };

  const performModpackSearch = React.useCallback(async (query: string) => {
    if (!query) {
        setModpackResults([]);
        setIsSearchingModpacks(false);
        return;
    }

    try {
        const response = await fetch(`/api/modrinth/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to search modpacks.');
        setModpackResults(data.hits);
    } catch (err) {
        console.error("Modpack search failed:", err);
        setModpackResults([]);
    } finally {
        setIsSearchingModpacks(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedModpack) {
        return;
    }

    const trimmedQuery = modpackSearchQuery.trim();
    if (trimmedQuery.length < 2) { // Only search for queries of 2+ characters
        setModpackResults([]);
        setIsSearchingModpacks(false);
        return;
    }

    setIsSearchingModpacks(true);
    setModpackResults([]);

    const handler = setTimeout(() => {
        performModpackSearch(trimmedQuery);
    }, 500); // 500ms debounce

    return () => {
        clearTimeout(handler);
    };
  }, [modpackSearchQuery, performModpackSearch, selectedModpack]);


  const handleSelectModpack = async (project: ModrinthProject) => {
    setSelectedModpack(project);
    setValue("modpackProjectId", project.project_id);
    setValue("name", project.title); // Pre-fill server name
    setModpackResults([]); // Clear results
    setModpackSearchQuery(project.title); // Put selected pack name in search bar

    // New logic to get RAM suggestion
    setIsSuggestingRam(true);
    const suggestion = await getRamSuggestion({
      modpackName: project.title,
      modpackDescription: project.description,
    });
    setIsSuggestingRam(false);

    if ('error' in suggestion) {
      toast({
        title: "RAM Suggestion Failed",
        description: "Couldn't get an AI-powered RAM suggestion. Please enter values manually.",
        variant: "default",
      });
    } else {
      // Find the closest option or a default for min/max ram
      const normalize = (ram: string) => {
          const megabytes = parseInt(ram.replace('M', ''), 10);
          if (isNaN(megabytes)) return '2048M';
          const closest = RAM_OPTIONS.reduce((prev, curr) => {
              const prevDiff = Math.abs(parseInt(prev.value.replace('M', '')) - megabytes);
              const currDiff = Math.abs(parseInt(curr.value.replace('M', '')) - megabytes);
              return currDiff < prevDiff ? curr : prev;
          });
          return closest.value;
      }
      
      setValue("minRam", normalize(suggestion.minRam));
      setValue("maxRam", normalize(suggestion.maxRam));

      toast({
        title: "RAM Suggested",
        description: `Set to recommended values. You can adjust if needed.`,
      });
    }
  };

  React.useEffect(() => {
    if (selectedModpack) {
      const fetchVersions = async () => {
        setIsLoadingModpackVersions(true);
        setModpackVersions([]);
        setValue("modpackVersionId", undefined);
        try {
          const response = await fetch(`/api/modrinth/project/${selectedModpack.project_id}/versions`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || 'Failed to fetch versions from Modrinth.');
          setModpackVersions(data);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error fetching versions.';
          toast({ title: "Version Fetch Failed", description: msg, variant: "destructive" });
        } finally {
          setIsLoadingModpackVersions(false);
        }
      };
      fetchVersions();
    }
  }, [selectedModpack, setValue, toast]);


  const onSubmit = async (data: ServerFormData) => {
    if (!canCreate) {
        toast({ title: "Permission Denied", description: "You do not have permission to create servers.", variant: "destructive" });
        return;
    }
    setIsLoading(true);

    let apiEndpoint = '/api/minecraft/servers';
    let payload: any = {};
    let isFormData = false;

    if (data.networkSetupType === 'upload_zip') {
      apiEndpoint = '/api/minecraft/servers/upload-zip';
      isFormData = true;
      const file = data.serverZip?.[0];
      if (!file) {
        toast({ title: "Invalid File", description: "Please select a .zip file to upload.", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      payload = new FormData();
      payload.append('serverZip', file);
      payload.append('serverName', data.name!);
      payload.append('port', String(data.port!));
      payload.append('jarFileName', data.jarFileName!);
      payload.append('minRam', data.minRam!);
      payload.append('maxRam', data.maxRam!);
      if (data.description) payload.append('description', data.description);
    } else if (data.networkSetupType === 'modpack') {
      apiEndpoint = '/api/minecraft/servers/create-from-modpack';
      payload = {
        serverName: data.name,
        port: data.port,
        minRam: data.minRam,
        maxRam: data.maxRam,
        modpackVersionId: data.modpackVersionId,
      };
    } else { // single_server
      if (data.serverType === 'PaperMC' && !fullPaperVersion) {
          toast({ title: "Incomplete Selection", description: "Please wait for build information to load before creating the server.", variant: "destructive" });
          setIsLoading(false);
          return;
      }
      if (data.serverType === 'Velocity' && !fullVelocityVersion) {
          toast({ title: "Incomplete Selection", description: "Please wait for build information to load before creating the server.", variant: "destructive" });
          setIsLoading(false);
          return;
      }

      payload = {
        serverName: data.name,
        port: data.port,
        serverType: data.serverType,
        serverVersion: data.serverType === 'PaperMC' ? fullPaperVersion : fullVelocityVersion,
        paperBuild: data.serverType === 'PaperMC' ? data.paperBuild : undefined,
        velocityBuild: data.serverType === 'Velocity' ? data.velocityBuild : undefined,
      };
    }
    
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        ...(isFormData ? { body: payload } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Success", description: result.message });
      router.push("/dashboard");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: "Creation Failed", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-2">
      <PageHeader title="Create New Server" description="Set up a new game server, a full network, or upload an existing one." />
      
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline">Server Setup Details</CardTitle>
          <CardDescription>Fill in the information below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <fieldset disabled={!canCreate}>
            <div>
              <Label htmlFor="networkSetupType">Setup Type</Label>
              <Controller name="networkSetupType" control={control} render={({ field }) => (
                  <Select onValueChange={(value) => handleSetupTypeChange(value)} value={field.value}>
                    <SelectTrigger id="networkSetupType" className="mt-1"><SelectValue placeholder="Select setup type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_server">Create a Single Server (PaperMC/Velocity)</SelectItem>
                      <SelectItem value="modpack">Install from Modrinth</SelectItem>
                      <SelectItem value="upload_zip">Upload Existing Server (.zip)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            
            {/* MODPACK UI */}
            {selectedNetworkSetupType === 'modpack' && (
              <Card className="p-4 bg-muted/50 space-y-4">
                <CardTitle className="text-lg font-semibold flex items-center gap-2"><Package/>Modpack Details</CardTitle>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search for modpacks (e.g., 'All the Mods 9')"
                    value={modpackSearchQuery}
                    onChange={(e) => {
                      setModpackSearchQuery(e.target.value);
                      if (selectedModpack) {
                          setSelectedModpack(null);
                          setValue("modpackProjectId", undefined);
                          setValue("modpackVersionId", undefined);
                          setModpackVersions([]);
                      }
                    }}
                    className="pl-10"
                  />
                  {isSearchingModpacks && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin" />}
                </div>

                {!selectedModpack && modpackResults.length > 0 && (
                  <ScrollArea className="h-64 border rounded-md">
                    <div className="p-2 space-y-2">
                      {modpackResults.map(proj => (
                        <Card key={proj.project_id} className="p-3 flex items-center gap-4 cursor-pointer hover:bg-background" onClick={() => handleSelectModpack(proj)}>
                          <Image src={proj.icon_url} alt={proj.title} width={48} height={48} className="rounded-md" />
                          <div className="flex-grow">
                            <p className="font-semibold">{proj.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{proj.description}</p>
                            <div className="flex items-center gap-2 text-xs mt-1 text-muted-foreground">
                              <span className="flex items-center gap-1"><Download className="h-3 w-3"/>{proj.downloads.toLocaleString()}</span>
                              <span className="flex items-center gap-1"><Server className="h-3 w-3"/>{proj.server_side}</span>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {selectedModpack && (
                  <Card className="p-3 flex items-center gap-4 bg-background">
                    <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    <Image src={selectedModpack.icon_url} alt={selectedModpack.title} width={48} height={48} className="rounded-md" />
                    <div className="flex-grow">
                      <p className="font-semibold">{selectedModpack.title}</p>
                      <p className="text-xs text-muted-foreground">Modpack selected. Choose a version below.</p>
                    </div>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="modpackVersionId" className="flex items-center">
                      Modpack Version {isLoadingModpackVersions && <Loader2 className="ml-2 h-4 w-4 animate-spin"/>}
                    </Label>
                    <Controller name="modpackVersionId" control={control} render={({field}) => (
                      <Select onValueChange={field.onChange} value={field.value} disabled={!selectedModpack || isLoadingModpackVersions}>
                        <SelectTrigger id="modpackVersionId" className="mt-1">
                          <SelectValue placeholder={!selectedModpack ? "Select a modpack first" : isLoadingModpackVersions ? "Loading..." : "Select a version"}/>
                        </SelectTrigger>
                        <SelectContent>
                          {modpackVersions.map(v => (
                            <SelectItem key={v.id} value={v.id}>
                              <div className="flex justify-between w-full">
                                <span>{v.name} ({v.version_number})</span>
                                <Badge variant="outline" className="ml-4">{v.loaders.join(', ')}</Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}/>
                    {errors.modpackVersionId && <p className="text-sm text-destructive mt-1">{errors.modpackVersionId.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="port">Port Number</Label>
                    <Controller name="port" control={control} render={({ field }) => ( <Input id="port" type="number" placeholder="e.g., 25565" {...field} className="mt-1" /> )}/>
                    {errors.port && <p className="text-sm text-destructive mt-1">{errors.port.message}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minRam" className="flex items-center gap-2">
                      Minimum RAM
                      {isSuggestingRam && <Loader2 className="h-4 w-4 animate-spin" />}
                    </Label>
                    <Controller name="minRam" control={control} render={({ field }) => ( 
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="minRam" className="mt-1"><SelectValue/></SelectTrigger>
                        <SelectContent>{RAM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}/>
                    {errors.minRam && <p className="text-sm text-destructive mt-1">{errors.minRam.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="maxRam" className="flex items-center gap-2">
                      Maximum RAM
                      {isSuggestingRam && <Loader2 className="h-4 w-4 animate-spin" />}
                    </Label>
                    <Controller name="maxRam" control={control} render={({ field }) => ( 
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="maxRam" className="mt-1"><SelectValue/></SelectTrigger>
                        <SelectContent>{RAM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    )}/>
                    {errors.maxRam && <p className="text-sm text-destructive mt-1">{errors.maxRam.message}</p>}
                  </div>
                </div>
                <div>
                  <Label htmlFor="name">Server Name</Label>
                  <Controller name="name" control={control} render={({ field }) => ( <Input id="name" placeholder="e.g., My Modded Server" {...field} className="mt-1" /> )}/>
                  {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
                </div>
              </Card>
            )}

            {/* Other form types */}
            
            {selectedNetworkSetupType === "upload_zip" && (
              <React.Fragment>
                <div className="space-y-4 rounded-md border p-4 bg-muted/50">
                  <h3 className="text-lg font-medium flex items-center gap-2"><Upload/>Upload Details</h3>
                  <p className="text-sm text-muted-foreground">Provide the details for your existing server and upload its contents in a .zip file.</p>
                   <div>
                    <Label htmlFor="name">Server Name</Label>
                    <Controller name="name" control={control} render={({ field }) => ( <Input id="name" placeholder="e.g., My Imported Server" {...field} className="mt-1" /> )}/>
                    {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="port">Port Number</Label>
                    <Controller name="port" control={control} render={({ field }) => ( <Input id="port" type="number" placeholder="e.g., 25565" {...field} className="mt-1" /> )}/>
                    {errors.port && <p className="text-sm text-destructive mt-1">{errors.port.message}</p>}
                  </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                      <Label htmlFor="minRam">Minimum RAM</Label>
                       <Controller name="minRam" control={control} render={({ field }) => ( 
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger id="minRam" className="mt-1"><SelectValue/></SelectTrigger>
                          <SelectContent>{RAM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                      )}/>
                      {errors.minRam && <p className="text-sm text-destructive mt-1">{errors.minRam.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="maxRam">Maximum RAM</Label>
                       <Controller name="maxRam" control={control} render={({ field }) => ( 
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger id="maxRam" className="mt-1"><SelectValue/></SelectTrigger>
                          <SelectContent>{RAM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                      )}/>
                      {errors.maxRam && <p className="text-sm text-destructive mt-1">{errors.maxRam.message}</p>}
                    </div>
                  </div>
                   <div>
                    <Label htmlFor="jarFileName">Executable JAR File Name</Label>
                    <Controller name="jarFileName" control={control} render={({ field }) => ( <Input id="jarFileName" placeholder="e.g., server.jar, fabric.jar" {...field} className="mt-1" /> )}/>
                    {errors.jarFileName && <p className="text-sm text-destructive mt-1">{errors.jarFileName.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Controller name="description" control={control} render={({ field }) => ( <Textarea id="description" placeholder="A brief description of the uploaded server" {...field} className="mt-1" /> )}/>
                  </div>
                  <div>
                    <Label htmlFor="serverZip">Server .zip File</Label>
                    <Input id="serverZip" type="file" {...register("serverZip")} accept=".zip" className="mt-1" />
                    {errors.serverZip && <p className="text-sm text-destructive mt-1">{errors.serverZip.message as string}</p>}
                  </div>
                </div>
              </React.Fragment>
            )}

            {selectedNetworkSetupType === "single_server" && (
              <React.Fragment>
                <div>
                  <Label htmlFor="name">Server Name</Label>
                  <Controller name="name" control={control} render={({ field }) => ( <Input id="name" placeholder="e.g., My Awesome Server" {...field} className="mt-1" /> )}/>
                  {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <Label htmlFor="port">Port Number</Label>
                  <Controller name="port" control={control} render={({ field }) => ( <Input id="port" type="number" placeholder="e.g., 25565" {...field} className="mt-1" /> )}/>
                  {errors.port && <p className="text-sm text-destructive mt-1">{errors.port.message}</p>}
                </div>
                <div>
                  <Label htmlFor="serverType">Server Type</Label>
                  <Controller name="serverType" control={control} render={({ field }) => (
                      <Select onValueChange={(value) => { field.onChange(value); setValue("version", ""); setValue("paperBuild", ""); setValue("velocityVersion", ""); setValue("velocityBuild", ""); setLatestPaperBuildNumber(null); setLatestVelocityBuildNumber(null); }} value={field.value}>
                        <SelectTrigger id="serverType" className="mt-1"><SelectValue placeholder="Select a server type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PaperMC">PaperMC (Minecraft Server)</SelectItem>
                          <SelectItem value="Velocity">Velocity (Proxy Server)</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  {errors.serverType && <p className="text-sm text-destructive mt-1">{errors.serverType.message}</p>}
                </div>
                {selectedServerType === "PaperMC" && (
                  <>
                    <div>
                      <Label htmlFor="version" className="flex items-center">Minecraft Version {isLoadingMinecraftVersions && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}</Label>
                      <Controller name="version" control={control} render={({ field }) => (
                          <Select onValueChange={(value) => { field.onChange(value); setLatestPaperBuildNumber(null); setPaperBuilds([]); resetField("paperBuild"); }} value={field.value} disabled={isLoadingMinecraftVersions || minecraftVersions.length === 0}>
                            <SelectTrigger id="version" className="mt-1"><SelectValue placeholder={isLoadingMinecraftVersions ? "Loading versions..." : (minecraftVersions.length === 0 ? "No versions available" : "Select a version")} /></SelectTrigger>
                            <SelectContent>{minecraftVersions.map((version) => ( <SelectItem key={version} value={version}>{version}</SelectItem> ))}</SelectContent>
                          </Select>
                        )} />
                      {errors.version && <p className="text-sm text-destructive mt-1">{errors.version.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="paperBuild" className="flex items-center">Paper Build {isLoadingPaperBuilds && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}</Label>
                      <Controller name="paperBuild" control={control} render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value} disabled={!selectedMinecraftVersion || isLoadingPaperBuilds || paperBuilds.length === 0}>
                            <SelectTrigger id="paperBuild" className="mt-1"><SelectValue placeholder={ !selectedMinecraftVersion ? "Select a version first" : isLoadingPaperBuilds ? "Loading builds..." : paperBuilds.length === 0 && selectedMinecraftVersion ? "No builds available" : "Select a build" } /></SelectTrigger>
                            <SelectContent>{paperBuilds.map((build) => ( <SelectItem key={build} value={String(build)}>{build}{build === latestPaperBuildNumber ? ' (Latest)' : ''}</SelectItem> ))}</SelectContent>
                          </Select>
                        )} />
                      {errors.paperBuild && <p className="text-sm text-destructive mt-1">{errors.paperBuild.message}</p>}
                    </div>
                  </>
                )}
                {selectedServerType === "Velocity" && (
                  <>
                    <div>
                      <Label htmlFor="velocityVersion" className="flex items-center">Velocity Version {isLoadingVelocityVersions && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}</Label>
                      <Controller name="velocityVersion" control={control} render={({ field }) => (
                          <Select onValueChange={(value) => { field.onChange(value); setLatestVelocityBuildNumber(null); setVelocityBuilds([]); resetField("velocityBuild"); }} value={field.value} disabled={isLoadingVelocityVersions || velocityVersions.length === 0}>
                            <SelectTrigger id="velocityVersion" className="mt-1"><SelectValue placeholder={isLoadingVelocityVersions ? "Loading versions..." : (velocityVersions.length === 0 ? "No versions available" : "Select a Velocity version")} /></SelectTrigger>
                            <SelectContent>{velocityVersions.map((version) => ( <SelectItem key={version} value={version}>{version}</SelectItem> ))}</SelectContent>
                          </Select>
                        )} />
                      {errors.velocityVersion && <p className="text-sm text-destructive mt-1">{errors.velocityVersion.message}</p>}
                    </div>
                    <div>
                      <Label htmlFor="velocityBuild" className="flex items-center">Velocity Build {isLoadingVelocityBuilds && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}</Label>
                      <Controller name="velocityBuild" control={control} render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value} disabled={!selectedVelocityVersion || isLoadingVelocityBuilds || velocityBuilds.length === 0}>
                            <SelectTrigger id="velocityBuild" className="mt-1"><SelectValue placeholder={ !selectedVelocityVersion ? "Select a Velocity version first" : isLoadingVelocityBuilds ? "Loading builds..." : velocityBuilds.length === 0 && selectedVelocityVersion ? "No builds available" : "Select a build" } /></SelectTrigger>
                            <SelectContent>{velocityBuilds.map((build) => ( <SelectItem key={build} value={String(build)}>{build}{build === latestVelocityBuildNumber ? ' (Latest)' : ''}</SelectItem> ))}</SelectContent>
                          </Select>
                        )} />
                      {errors.velocityBuild && <p className="text-sm text-destructive mt-1">{errors.velocityBuild.message}</p>}
                    </div>
                  </>
                )}
              </React.Fragment>
            )}

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isLoading || !canCreate}>
                {isLoading ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : selectedNetworkSetupType === 'upload_zip' ? ( <Upload className="mr-2 h-4 w-4" /> ) : ( <Save className="mr-2 h-4 w-4" /> )}
                {selectedNetworkSetupType === 'upload_zip' ? 'Upload and Create' : 'Create Server'}
              </Button>
            </div>
          </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

