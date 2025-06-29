
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { GameServer, ServerTemplate, DirectoryItem, Backup, ServerPlugin } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import * as TOML from '@iarna/toml';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Save, 
  Loader2, 
  Puzzle, 
  FileText, 
  AlertTriangle, 
  Archive, 
  PlusCircle, 
  Trash2, 
  FolderIcon, 
  FileIcon, 
  ArrowUpCircle,
  UploadCloud,
  FolderPlus,
  Edit3,
  EyeIcon,
  ArrowLeft,
  Download,
  ArchiveRestore,
  ListX,
  X as XIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";


// Mock templates, replace with API call if needed later
const MOCK_TEMPLATES: ServerTemplate[] = [];

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


const normalizeRamToOption = (ramValue: string | undefined): string => {
  if (!ramValue) return "1024M";
  const upperRamValue = ramValue.toUpperCase();
  let numericValueMb: number;

  if (upperRamValue.endsWith('G')) {
    numericValueMb = parseInt(upperRamValue.replace('G', ''), 10) * 1024;
  } else if (upperRamValue.endsWith('M')) {
    numericValueMb = parseInt(upperRamValue.replace('M', ''), 10);
  } else {
    numericValueMb = parseInt(upperRamValue, 10); // Assume MB if no unit
    if (isNaN(numericValueMb)) return "1024M";
  }

  if (isNaN(numericValueMb)) return "1024M";

  const optionValue = `${numericValueMb}M`;
  const exists = RAM_OPTIONS.some(opt => opt.value === optionValue);
  
  return exists ? optionValue : "1024M";
};

const velocityTomlDefaults: Record<string, any> = {
    bind: '0.0.0.0:25577',
    motd: '"A Velocity Server"',
    general: {
        'show-max-players': 500,
        'online-mode': true,
        'force-key-authentication': true,
        'prevent-client-proxy-connections': true,
    },
    forwarding: {
        'player-info-forwarding-mode': 'none',
        'forwarding-secret-file': 'forwarding.secret',
    },
    advanced: {
        'compression-threshold': 256,
        'compression-level': -1,
        'login-ratelimit': 3000,
        'connection-timeout': 5000,
        'read-timeout': 30000,
        'haproxy-protocol': false,
        'proxy-protocol': false,
        'server-name-comparison-mode': 'default',
    },
    query: {
        enabled: false,
        port: 25577,
        map: 'Velocity',
    },
    metrics: {
        enabled: false,
        'endpoint-enabled': false,
    },
};

const tomlConfig: Record<string, { title: string, keys: Record<"root" | "section", string[]> }> = {
  general: { 
    title: "General", 
    keys: {
      root: ['bind', 'motd'],
      section: ['show-max-players', 'online-mode', 'force-key-authentication', 'prevent-client-proxy-connections']
    }
  },
  forwarding: { title: "Forwarding", keys: { root: [], section: ['player-info-forwarding-mode', 'forwarding-secret-file'] } },
  advanced: { title: "Advanced", keys: { root: [], section: ['compression-threshold', 'compression-level', 'login-ratelimit', 'connection-timeout', 'read-timeout', 'haproxy-protocol', 'proxy-protocol', 'server-name-comparison-mode'] } },
  query: { title: "Query", keys: { root: [], section: ['enabled', 'port', 'map'] } },
  metrics: { title: "Metrics", keys: { root: [], section: ['enabled', 'endpoint-enabled'] } },
};


export default function EditServerPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.serverId as string;
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = user?.permissions?.includes('edit_configs');
  const canManagePlugins = user?.permissions?.includes('manage_plugins');

  const [server, setServer] = React.useState<GameServer | null>(null);
  const [template, setTemplate] = React.useState<ServerTemplate | null>(null);
  const [isLoading, setIsLoading] = React.useState(false); 
  const [isFetching, setIsFetching] = React.useState(true); 
  const [apiError, setApiError] = React.useState<string | null>(null);

  // Form states for editable fields
  const [serverName, setServerName] = React.useState("");
  const [serverPort, setServerPort] = React.useState<number | string>("");
  const [description, setDescription] = React.useState("");
  const [minRam, setMinRam] = React.useState(RAM_OPTIONS[1].value); // Default to 1GB
  const [maxRam, setMaxRam] = React.useState(RAM_OPTIONS[2].value); // Default to 2GB
  const [launchArgs, setLaunchArgs] = React.useState("");
  const [maxPlayers, setMaxPlayers] = React.useState<number | string>("");

  // Backups state
  const [backups, setBackups] = React.useState<Backup[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = React.useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = React.useState(false);
  const [backupToRestore, setBackupToRestore] = React.useState<Backup | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = React.useState(false);
  const [backupToDelete, setBackupToDelete] = React.useState<Backup | null>(null);
  const [isDeletingBackup, setIsDeletingBackup] = React.useState(false);

  // File Manager State
  const fileUploadRef = React.useRef<HTMLInputElement>(null);
  const [currentFilePath, setCurrentFilePath] = React.useState<string>("/");
  const [fileList, setFileList] = React.useState<DirectoryItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = React.useState(false);
  const [fileManagerError, setFileManagerError] = React.useState<string | null>(null);

  const [showEditFileDialog, setShowEditFileDialog] = React.useState(false);
  const [editingFile, setEditingFile] = React.useState<DirectoryItem | null>(null);
  const [editingFileContent, setEditingFileContent] = React.useState("");
  const [isSavingFile, setIsSavingFile] = React.useState(false);
  const [isLoadingFileContent, setIsLoadingFileContent] = React.useState(false);

  const [showCreateFolderDialog, setShowCreateFolderDialog] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);

  const [showRenameDialog, setShowRenameDialog] = React.useState(false);
  const [itemToRename, setItemToRename] = React.useState<DirectoryItem | null>(null);
  const [newItemNameInput, setNewItemNameInput] = React.useState("");
  const [isRenamingItem, setIsRenamingItem] = React.useState(false);
  
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [itemToDelete, setItemToDelete] = React.useState<DirectoryItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = React.useState(false);

  // Plugin Manager State
  const [plugins, setPlugins] = React.useState<ServerPlugin[]>([]);
  const [isLoadingPlugins, setIsLoadingPlugins] = React.useState(false);
  const [pluginActionStates, setPluginActionStates] = React.useState<{ [key: string]: boolean }>({});
  const [pluginToUninstall, setPluginToUninstall] = React.useState<ServerPlugin | null>(null);
  const [isUninstalling, setIsUninstalling] = React.useState(false);

  // Server.properties state
  const [serverProperties, setServerProperties] = React.useState<Record<string, string> | null>(null);
  const [isLoadingProperties, setIsLoadingProperties] = React.useState(false);
  const [propertiesError, setPropertiesError] = React.useState<string | null>(null);
  const [isSavingProperties, setIsSavingProperties] = React.useState(false);

  // Velocity.toml state
  const [velocityToml, setVelocityToml] = React.useState<Record<string, any> | null>(null);
  const [isLoadingVelocityToml, setIsLoadingVelocityToml] = React.useState(false);
  const [velocityTomlError, setVelocityTomlError] = React.useState<string | null>(null);
  const [isSavingVelocityToml, setIsSavingVelocityToml] = React.useState(false);
  const [serversTomlString, setServersTomlString] = React.useState("");
  const [forcedHostsTomlString, setForcedHostsTomlString] = React.useState("");
  const [tomlParseError, setTomlParseError] = React.useState<{servers?: string; 'forced-hosts'?: string}>({});


  const forwardingModeOptions = {
    "none": "No forwarding will be done. All players will appear to be connecting from the proxy and will have offline-mode UUIDs.",
    "legacy": "Forward player IPs and UUIDs in a BungeeCord-compatible format. Use this if you run servers using Minecraft 1.12 or lower.",
    "bungeeguard": "Forward player IPs and UUIDs in a format supported by the BungeeGuard plugin. Use this if you run servers using Minecraft 1.12 or lower, and are unable to implement network level firewalling (on a shared host).",
    "modern": "Forward player IPs and UUIDs as part of the login process using Velocity's native forwarding. Only applicable for Minecraft 1.13 or higher.",
  };

  const isTextEditableFile = (fileName: string) => {
    const editableExtensions = ['.txt', '.yml', '.yaml', '.properties', '.json', '.log', '.cfg', '.conf', '.ini', '.toml', '.secret'];
    if (fileName.toLowerCase().endsWith('.jar')) return false;
    return editableExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  };

  React.useEffect(() => {
    if (!serverId) {
      setIsFetching(false);
      setApiError("Server ID is missing from the URL.");
      return;
    }
    setIsFetching(true);
    setApiError(null);

    const fetchServerData = async () => {
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
          setServerName(foundServer.name);
          setServerPort(foundServer.port || "");
          setDescription(foundServer.description || "");
          setMinRam(normalizeRamToOption(foundServer.minRam));
          setMaxRam(normalizeRamToOption(foundServer.maxRam));
          setLaunchArgs(foundServer.launchArgs || "");
          setMaxPlayers(foundServer.maxPlayers || 20);
          
          if (foundServer.templateId) {
            const foundTemplate = MOCK_TEMPLATES.find(t => t.id === foundServer.templateId);
            setTemplate(foundTemplate || null);
          }
        } else {
          setServer(null);
          setApiError(`Server with ID "${serverId}" not found in API response.`);
        }
      } catch (err) {
        console.error("Error fetching server data:", err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while fetching server data.";
        setApiError(errorMessage);
        setServer(null);
        toast({
          title: "Error Loading Server",
          description: errorMessage.substring(0,100),
          variant: "destructive",
        });
      } finally {
        setIsFetching(false);
      }
    };

    fetchServerData();
  }, [serverId, toast]);

  const fetchConfig = React.useCallback(async () => {
      if (!server) return;

      if (server.softwareType === 'Velocity') {
          setIsLoadingVelocityToml(true);
          setVelocityTomlError(null);
          try {
              const response = await fetch(`/api/minecraft/servers/${serverId}/velocity-toml`);
              if (!response.ok) {
                   const errorText = await response.text();
                  throw new Error(JSON.parse(errorText).message || `Failed to load velocity.toml. Status: ${response.status}`);
              }
              const data = await response.json();
              setVelocityToml(data);
              setServersTomlString(TOML.stringify(data.servers || {}));
              setForcedHostsTomlString(TOML.stringify(data['forced-hosts'] || {}));
          } catch (err) {
              const msg = err instanceof Error ? err.message : 'An unknown error occurred.';
              setVelocityTomlError(msg);
              setServersTomlString('# Error loading initial data');
              setForcedHostsTomlString('# Error loading initial data');
          } finally {
              setIsLoadingVelocityToml(false);
          }
      } else {
          setIsLoadingProperties(true);
          setPropertiesError(null);
          try {
              const response = await fetch(`/api/minecraft/servers/${serverId}/server-properties`);
              if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(JSON.parse(errorText).message || `Failed to load properties. Status: ${response.status}`);
              }
              const data = await response.json();
              setServerProperties(data);
          } catch (err) {
              const msg = err instanceof Error ? err.message : 'An unknown error occurred.';
              setPropertiesError(msg);
          } finally {
              setIsLoadingProperties(false);
          }
      }
  }, [server, serverId]);

  const handlePropertyChange = (key: string, value: string) => {
      setServerProperties(prev => prev ? { ...prev, [key]: value } : { [key]: value });
  };

  const handleSaveProperties = async () => {
      if (!serverProperties || !canEdit) return;
      setIsSavingProperties(true);
      try {
          const response = await fetch(`/api/minecraft/servers/${serverId}/server-properties`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(serverProperties),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message);
          toast({ title: 'Success', description: result.message });
      } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to save server properties.';
          toast({ title: 'Error', description: msg, variant: 'destructive' });
      } finally {
          setIsSavingProperties(false);
      }
  };

  const handleTomlChange = (key: string, value: any, section?: string) => {
    setVelocityToml(prev => {
        if (!prev) return { [key]: value };
        const newToml = JSON.parse(JSON.stringify(prev));
        if (section) {
            if (!newToml[section]) newToml[section] = {};
            newToml[section][key] = value;
        } else {
            newToml[key] = value;
        }
        return newToml;
    });
  };

  const handleSaveVelocityToml = async () => {
    if (!velocityToml || !canEdit) return;

    let parsedServers, parsedForcedHosts;
    let hasError = false;
    const newErrors: typeof tomlParseError = {};

    try {
        parsedServers = TOML.parse(serversTomlString);
        newErrors.servers = undefined;
    } catch (err) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : "Invalid TOML format";
        newErrors.servers = msg;
        hasError = true;
    }

    try {
        parsedForcedHosts = TOML.parse(forcedHostsTomlString);
        newErrors['forced-hosts'] = undefined;
    } catch (err) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : "Invalid TOML format";
        newErrors['forced-hosts'] = msg;
        hasError = true;
    }

    setTomlParseError(newErrors);

    if (hasError) {
      toast({
          title: 'Invalid TOML',
          description: 'Cannot save, please fix the errors in the highlighted fields.',
          variant: 'destructive',
      });
      return;
    }

    const newTomlData = {
        ...velocityToml,
        servers: parsedServers,
        'forced-hosts': parsedForcedHosts,
    };

    setIsSavingVelocityToml(true);
    try {
        const response = await fetch(`/api/minecraft/servers/${serverId}/velocity-toml`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTomlData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        toast({ title: 'Success', description: result.message });
        setVelocityToml(newTomlData);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save velocity.toml.';
        toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
        setIsSavingVelocityToml(false);
    }
  };

  const fetchFiles = React.useCallback(async (pathToFetch: string) => {
    if (!serverId) return;
    setIsLoadingFiles(true);
    setFileManagerError(null);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/files?path=${encodeURIComponent(pathToFetch)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to list files. Status: ${response.status}`);
      }
      const data: DirectoryItem[] = await response.json();
      setFileList(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred while fetching files.";
      setFileManagerError(errorMessage);
      setFileList([]);
      toast({
        title: "Error Loading Files",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiles(false);
    }
  }, [serverId, toast]);

  const handleSaveChanges = async () => {
    if (!server || !canEdit) return;
    setIsLoading(true);
    
    const updatedServerData = {
      name: serverName,
      port: parseInt(String(serverPort), 10),
      description,
      minRam,
      maxRam,
      launchArgs,
      maxPlayers: parseInt(String(maxPlayers), 10),
    };

    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedServerData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Failed to update server. Status: ${response.status}`);
      }
      
      setServer(prev => prev ? { ...prev, ...result.server } : null); 
      toast({
        title: "Changes Saved",
        description: result.message || `Configuration for server "${serverName}" has been updated.`,
      });
    } catch (err) {
       const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during save.";
       toast({
        title: "Error Saving Changes",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchBackups = React.useCallback(async () => {
    if (!serverId) return;
    setIsLoadingBackups(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/backups`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch backups.');
      }
      const backupData: Backup[] = await response.json();
      setBackups(backupData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred while fetching backups.";
      toast({ title: "Error Loading Backups", description: msg, variant: "destructive" });
    } finally {
      setIsLoadingBackups(false);
    }
  }, [serverId, toast]);

  const handleCreateBackup = async () => {
    if (!canEdit || isCreatingBackup || !serverId) return;
    setIsCreatingBackup(true);
    toast({ title: "Backup In Progress", description: "Creating a new backup. This may take a moment..." });
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/backups`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Backup Created", description: result.message });
      fetchBackups(); // Refresh the list
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Backup Failed", description: msg, variant: "destructive" });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!canEdit || isRestoringBackup || !backupToRestore || !serverId) return;
    setIsRestoringBackup(true);
    toast({ title: "Restore In Progress", description: `Restoring from ${backupToRestore.fileName}. Please wait.` });
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/backups/${backupToRestore.fileName}/restore`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Restore Complete", description: result.message });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred during restore.";
      toast({ title: "Restore Failed", description: msg, variant: "destructive" });
    } finally {
      setIsRestoringBackup(false);
      setBackupToRestore(null);
    }
  };

  const handleDeleteBackup = async () => {
    if (!canEdit || isDeletingBackup || !backupToDelete || !serverId) return;
    setIsDeletingBackup(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/backups/${backupToDelete.fileName}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast({ title: "Backup Deleted", description: result.message });
      fetchBackups(); // Refresh list
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Delete Failed", description: msg, variant: "destructive" });
    } finally {
      setIsDeletingBackup(false);
      setBackupToDelete(null);
    }
  };


  const handleItemClick = async (item: DirectoryItem) => {
    if (item.type === 'folder') {
      setCurrentFilePath(item.path);
    } else { // File
      if (isTextEditableFile(item.name)) {
        setEditingFile(item);
        setIsLoadingFileContent(true);
        setShowEditFileDialog(true);
        try {
          const response = await fetch(`/api/minecraft/servers/${serverId}/files/content?path=${encodeURIComponent(item.path)}`);
          if (!response.ok) {
            const errorData = await response.text(); 
            throw new Error(errorData || `Failed to fetch file content. Status: ${response.status}`);
          }
          const content = await response.text(); 
          setEditingFileContent(content);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Error loading file content.";
          toast({ title: "Error", description: errorMessage, variant: "destructive" });
          setEditingFileContent(`Error loading file content: ${errorMessage}`);
        } finally {
          setIsLoadingFileContent(false);
        }
      } else {
        toast({
          title: "Cannot Edit File",
          description: `File type "${item.name.split('.').pop()}" cannot be edited directly.`,
          variant: "default",
        });
      }
    }
  };

  const handleSaveFileContent = async () => {
    if (!editingFile || !serverId || !canEdit) return;
    setIsSavingFile(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/files/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: editingFile.path, newContent: editingFileContent }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Failed to save file. Status: ${response.status}`);
      }
      toast({ title: "File Saved", description: `File "${editingFile.name}" saved successfully.` });
      setShowEditFileDialog(false);
      setEditingFile(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Error Saving File", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSavingFile(false);
    }
  };

  const handleGoUpDirectory = () => {
    if (currentFilePath === "/" || currentFilePath === "") return;
    let parentPath = currentFilePath.replace(/\/$/, "").substring(0, currentFilePath.replace(/\/$/, "").lastIndexOf('/')) + "/";
    if (parentPath === "//" || parentPath === "") parentPath = "/";
    setCurrentFilePath(parentPath);
  };

  const handleTriggerUpload = () => {
    if (!canEdit) return;
    fileUploadRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !serverId || !canEdit) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsLoadingFiles(true); 
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/files/upload?destinationPath=${encodeURIComponent(currentFilePath)}`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `File upload failed. Status: ${response.status}`);
      }
      toast({ title: "File Uploaded", description: `File "${file.name}" uploaded to ${currentFilePath}.` });
      fetchFiles(currentFilePath); 
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during upload.";
      toast({ title: "Upload Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoadingFiles(false);
      if(fileUploadRef.current) fileUploadRef.current.value = ""; 
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !serverId || !canEdit) return;
    setIsCreatingFolder(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/files/create-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPath: currentFilePath, newFolderName }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Failed to create folder. Status: ${response.status}`);
      }
      toast({ title: "Folder Created", description: `Folder "${newFolderName}" created.` });
      setShowCreateFolderDialog(false);
      setNewFolderName("");
      fetchFiles(currentFilePath);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Error Creating Folder", description: errorMessage, variant: "destructive" });
    } finally {
      setIsCreatingFolder(false);
    }
  };
  
  const handleRenameItemInitiate = (item: DirectoryItem) => {
    if (!canEdit) return;
    setItemToRename(item);
    setNewItemNameInput(item.name);
    setShowRenameDialog(true);
  };

  const handleConfirmRename = async () => {
    if (!itemToRename || !newItemNameInput.trim() || !serverId || !canEdit) return;
    setIsRenamingItem(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/files/actions/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemPathToRename: itemToRename.path, newItemName: newItemNameInput.trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Failed to rename. Status: ${response.status}`);
      }
      toast({ title: "Item Renamed", description: `"${itemToRename.name}" renamed to "${newItemNameInput.trim()}".` });
      setShowRenameDialog(false);
      setItemToRename(null);
      fetchFiles(currentFilePath);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Error Renaming", description: errorMessage, variant: "destructive" });
    } finally {
      setIsRenamingItem(false);
    }
  };

  const handleDeleteItemInitiate = (item: DirectoryItem) => {
    if (!canEdit) return;
    setItemToDelete(item);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete || !serverId || !canEdit) return;
    setIsDeletingItem(true);
    try {
      const response = await fetch(`/api/minecraft/servers/${serverId}/files/actions/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePathToDelete: itemToDelete.path }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `Failed to delete. Status: ${response.status}`);
      }
      toast({ title: "Item Deleted", description: `"${itemToDelete.name}" deleted.` });
      setShowDeleteDialog(false);
      setItemToDelete(null);
      fetchFiles(currentFilePath);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      toast({ title: "Error Deleting", description: errorMessage, variant: "destructive" });
    } finally {
      setIsDeletingItem(false);
    }
  };

  const fetchPlugins = React.useCallback(async () => {
    if (!serverId) return;
    setIsLoadingPlugins(true);
    try {
        const response = await fetch(`/api/minecraft/servers/${serverId}/plugins`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch plugins.');
        }
        const data: ServerPlugin[] = await response.json();
        setPlugins(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "An unknown error occurred while fetching plugins.";
        toast({ title: "Error Loading Plugins", description: msg, variant: "destructive" });
    } finally {
        setIsLoadingPlugins(false);
    }
  }, [serverId, toast]);

  const handleTogglePlugin = async (plugin: ServerPlugin) => {
      if (!canManagePlugins) return;
      setPluginActionStates(prev => ({ ...prev, [plugin.fileName]: true }));
      try {
          const response = await fetch(`/api/minecraft/servers/${serverId}/plugins/toggle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  pluginFileName: plugin.fileName,
                  targetIsEnabled: !plugin.isEnabled,
              }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message);
          toast({ title: "Plugin Toggled", description: result.message });
          fetchPlugins(); // Refresh list
      } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not toggle plugin state.";
          toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
          setPluginActionStates(prev => ({ ...prev, [plugin.fileName]: false }));
      }
  };

  const handleUninstallPlugin = async () => {
      if (!pluginToUninstall || !canManagePlugins) return;
      setIsUninstalling(true);
      try {
          const response = await fetch(`/api/minecraft/servers/${serverId}/plugins/uninstall`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pluginFileName: pluginToUninstall.fileName }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message);
          toast({ title: "Plugin Uninstalled", description: result.message });
          fetchPlugins();
      } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not uninstall plugin.";
          toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
          setIsUninstalling(false);
          setPluginToUninstall(null);
      }
  };

  const propertyCategories: Record<string, string[]> = {
    'General': ['motd', 'gamemode', 'difficulty', 'force-gamemode'],
    'World': ['level-name', 'level-seed', 'generate-structures', 'level-type', 'max-world-size', 'view-distance', 'simulation-distance', 'allow-nether'],
    'Players': ['max-players', 'allow-flight', 'pvp', 'online-mode', 'white-list', 'enforce-whitelist', 'spawn-protection', 'max-tick-time'],
    'Network': ['server-port', 'network-compression-threshold', 'use-native-transport'],
    'Advanced': ['enable-rcon', 'rcon.port', 'rcon.password', 'enable-query', 'query.port', 'function-permission-level', 'op-permission-level', 'sync-chunk-writes'],
  };
  const allCategorizedProperties = new Set(Object.values(propertyCategories).flat());
  const booleanProperties = new Set(['allow-flight', 'allow-nether', 'enforce-whitelist', 'force-gamemode', 'generate-structures', 'online-mode', 'pvp', 'white-list', 'enable-rcon', 'enable-command-block', 'enable-query', 'sync-chunk-writes', 'use-native-transport']);
  const gamemodeOptions = ['survival', 'creative', 'adventure', 'spectator'];
  const difficultyOptions = ['peaceful', 'easy', 'normal', 'hard'];

  const renderPropertyInput = (key: string, value: string) => {
    if (booleanProperties.has(key)) {
        return (
            <Switch
                checked={String(value).toLowerCase() === 'true'}
                onCheckedChange={(checked) => handlePropertyChange(key, String(checked))}
                disabled={!canEdit}
                id={`prop-${key}`}
            />
        );
    }

    if (key === 'gamemode') {
        return (
            <Select value={value} onValueChange={(v) => handlePropertyChange(key, v)} disabled={!canEdit}>
                <SelectTrigger id={`prop-${key}`} className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {gamemodeOptions.map(opt => <SelectItem key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</SelectItem>)}
                </SelectContent>
            </Select>
        );
    }

    if (key === 'difficulty') {
        return (
            <Select value={value} onValueChange={(v) => handlePropertyChange(key, v)} disabled={!canEdit}>
                <SelectTrigger id={`prop-${key}`} className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {difficultyOptions.map(opt => <SelectItem key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</SelectItem>)}
                </SelectContent>
            </Select>
        );
    }

    const isNumeric = ['server-port', 'rcon.port', 'query.port', 'view-distance', 'simulation-distance', 'max-players', 'network-compression-threshold', 'spawn-protection', 'max-world-size', 'op-permission-level', 'function-permission-level', 'max-tick-time'].includes(key);

    return (
        <Input
            id={`prop-${key}`}
            type={isNumeric ? 'number' : 'text'}
            value={value}
            onChange={(e) => handlePropertyChange(key, e.target.value)}
            disabled={!canEdit}
            className="max-w-xs"
            placeholder={key.includes('password') ? '••••••••' : `Enter value for ${key}`}
        />
    );
  };
  
  const otherProperties = serverProperties ? Object.entries(serverProperties).filter(([key]) => !allCategorizedProperties.has(key) && key !== 'server-ip') : [];

  const renderTomlInput = (key: string, value: any, section?: string) => {
    if (key === 'player-info-forwarding-mode') {
      const selectedMode = String(value) as keyof typeof forwardingModeOptions;
      const description = forwardingModeOptions[selectedMode];
      return (
        <div className="flex flex-col gap-2">
          <Select value={selectedMode} onValueChange={(v) => handleTomlChange(key, v, section)} disabled={!canEdit}>
              <SelectTrigger id={`toml-${section}-${key}`} className="max-w-xs">
                  <SelectValue />
              </SelectTrigger>
              <SelectContent>
                  {Object.keys(forwardingModeOptions).map((mode) => (
                      <SelectItem key={mode} value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</SelectItem>
                  ))}
              </SelectContent>
          </Select>
          {description && <p className="text-xs text-muted-foreground max-w-xs">{description}</p>}
        </div>
      );
    }
  
    const isBoolean = typeof value === 'boolean';
    if (isBoolean) {
        return <Switch checked={value} onCheckedChange={(checked) => handleTomlChange(key, checked, section)} disabled={!canEdit} id={`toml-${section}-${key}`} />;
    }
    const isNumber = typeof value === 'number';
    return <Input type={isNumber ? 'number' : 'text'} value={value ?? ''} onChange={(e) => handleTomlChange(key, isNumber ? parseInt(e.target.value, 10) || 0 : e.target.value, section)} disabled={!canEdit} id={`toml-${section}-${key}`} className="max-w-xs" />;
  };



  if (isFetching) {
    return (
      <div className="container mx-auto py-8 flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading server configuration...</p>
      </div>
    );
  }

  if (!server && apiError) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Error" description="Failed to load server configuration." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Server</AlertTitle>
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          Back to Dashboard
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
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <PageHeader title={`${canEdit ? 'Edit' : 'View'} Server: ${server.name}`} description={`Manage configuration for ${server.name} (ID: ${server.id}).`}>
        <Button variant="outline" onClick={() => router.push(`/servers/${serverId}/manage`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Manage
        </Button>
        {canEdit && (
          <Button onClick={handleSaveChanges} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        )}
      </PageHeader>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 mb-4 overflow-x-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="main-config" onClick={fetchConfig}>Config Editor</TabsTrigger>
          <TabsTrigger value="file-manager" onClick={() => fetchFiles(currentFilePath)}>File Manager</TabsTrigger>
          <TabsTrigger value="backups" onClick={fetchBackups}>Backups</TabsTrigger>
          <TabsTrigger value="plugins" onClick={fetchPlugins}>Plugins</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">General Information</CardTitle>
              <CardDescription>Basic settings for your server instance.</CardDescription>
            </CardHeader>
            <CardContent>
              <fieldset disabled={!canEdit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="serverName">Server Name</Label>
                    <Input id="serverName" value={serverName} onChange={(e) => setServerName(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="serverPort">Port Number</Label>
                    <Input id="serverPort" type="number" value={serverPort} onChange={(e) => setServerPort(e.target.value === "" ? "" : parseInt(e.target.value,10))} className="mt-1" />
                  </div>
                </div>
                <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" placeholder="A brief description of your server."/>
                  </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                      <Label htmlFor="minRam">Minimum RAM</Label>
                      <Select value={minRam} onValueChange={setMinRam}>
                          <SelectTrigger id="minRam" className="mt-1">
                              <SelectValue placeholder="Select Min RAM" />
                          </SelectTrigger>
                          <SelectContent>
                              {RAM_OPTIONS.map(option => (
                                  <SelectItem key={`min-${option.value}`} value={option.value}>
                                      {option.label}
                                  </SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
                  <div>
                      <Label htmlFor="maxRam">Maximum RAM</Label>
                      <Select value={maxRam} onValueChange={setMaxRam}>
                          <SelectTrigger id="maxRam" className="mt-1">
                              <SelectValue placeholder="Select Max RAM" />
                          </SelectTrigger>
                          <SelectContent>
                              {RAM_OPTIONS.map(option => (
                                  <SelectItem key={`max-${option.value}`} value={option.value}>
                                      {option.label}
                                  </SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
                </div>
                <div>
                    <Label htmlFor="launchArgs">Custom Launch Arguments</Label>
                    <Input id="launchArgs" value={launchArgs} onChange={(e) => setLaunchArgs(e.target.value)} className="mt-1" placeholder="e.g., -XX:+UseG1GC"/>
                  </div>
                  <div>
                    <Label htmlFor="maxPlayers">Max Players</Label>
                    <Input id="maxPlayers" type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value === "" ? "" : parseInt(e.target.value,10))} className="mt-1" />
                  </div>
                {template && (
                  <div>
                    <Label>Base Template</Label>
                    <p className="text-sm text-muted-foreground mt-1 p-2 border rounded-md bg-muted/50">{template.name} - <i>{template.description}</i></p>
                  </div>
                )}
                {!template && server.templateId && (
                  <div>
                    <Label>Base Template ID</Label>
                    <p className="text-sm text-muted-foreground mt-1 p-2 border rounded-md bg-muted/50">
                      {server.templateId} (Template data not loaded)
                    </p>
                  </div>
                )}
              </fieldset>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="main-config">
            {server?.softwareType === 'Velocity' ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><FileText /> velocity.toml</CardTitle>
                        <CardDescription>Edit the core Velocity configuration. Changes require a restart.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingVelocityToml ? (
                             <div className="flex justify-center items-center py-6"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading velocity.toml...</p></div>
                        ) : velocityTomlError ? (
                             <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{velocityTomlError}</AlertDescription></Alert>
                        ) : velocityToml ? (
                            <Accordion type="multiple" defaultValue={['general', 'servers-and-hosts']} className="w-full">
                                {Object.entries(tomlConfig).map(([sectionKey, section]) => (
                                    <AccordionItem value={sectionKey} key={sectionKey}>
                                        <AccordionTrigger className="text-base font-semibold">{section.title}</AccordionTrigger>
                                        <AccordionContent className="pt-2">
                                            <Table>
                                                <TableBody>
                                                    {section.keys.root?.map(key => {
                                                        const value = velocityToml?.[key] ?? velocityTomlDefaults[key];
                                                        return (
                                                        <TableRow key={`root-${key}`}>
                                                            <TableCell className="font-medium w-1/3 align-top py-3"><Label htmlFor={`toml-root-${key}`}>{key}</Label></TableCell>
                                                            <TableCell className="w-2/3">{renderTomlInput(key, value, undefined)}</TableCell>
                                                        </TableRow>
                                                        );
                                                    })}
                                                    {section.keys.section?.map(key => {
                                                        const value = velocityToml?.[sectionKey]?.[key] ?? velocityTomlDefaults[sectionKey]?.[key];
                                                        return (
                                                        <TableRow key={`${sectionKey}-${key}`}>
                                                            <TableCell className="font-medium w-1/3 align-top py-3"><Label htmlFor={`toml-${sectionKey}-${key}`}>{key}</Label></TableCell>
                                                            <TableCell className="w-2/3">{renderTomlInput(key, value, sectionKey)}</TableCell>
                                                        </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                                 <AccordionItem value="servers-and-hosts">
                                    <AccordionTrigger className="text-base font-semibold">Servers & Forced Hosts</AccordionTrigger>
                                    <AccordionContent className="pt-2 space-y-4">
                                        <div>
                                            <Label htmlFor="toml-try">Server Try Order</Label>
                                            <p className="text-xs text-muted-foreground mb-1">Comma-separated list of server names to try connecting to first.</p>
                                            <Input id="toml-try" value={(velocityToml.try || []).join(', ')} onChange={(e) => handleTomlChange('try', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} disabled={!canEdit} />
                                        </div>
                                         <div>
                                            <Label htmlFor="toml-servers">Servers</Label>
                                            <p className="text-xs text-muted-foreground mb-1">TOML configuration for backend servers. E.g., hub = "127.0.0.1:25566"</p>
                                            <Textarea
                                                id="toml-servers"
                                                value={serversTomlString}
                                                onChange={(e) => setServersTomlString(e.target.value)}
                                                disabled={!canEdit}
                                                rows={4}
                                                className={cn("font-code", tomlParseError.servers && "border-destructive focus-visible:ring-destructive")}
                                            />
                                            {tomlParseError.servers && <p className="text-sm text-destructive mt-1">{tomlParseError.servers}</p>}
                                        </div>
                                         <div>
                                            <Label htmlFor="toml-forced-hosts">Forced Hosts</Label>
                                            <p className="text-xs text-muted-foreground mb-1">Force a domain to a specific server. E.g., "hub.example.com" = ["hub"]</p>
                                            <Textarea
                                                id="toml-forced-hosts"
                                                value={forcedHostsTomlString}
                                                onChange={(e) => setForcedHostsTomlString(e.target.value)}
                                                disabled={!canEdit}
                                                rows={4}
                                                className={cn("font-code", tomlParseError['forced-hosts'] && "border-destructive focus-visible:ring-destructive")}
                                            />
                                            {tomlParseError['forced-hosts'] && <p className="text-sm text-destructive mt-1">{tomlParseError['forced-hosts']}</p>}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        ) : (
                            <p className="text-muted-foreground text-center py-4">No `velocity.toml` file found. Saving will create one.</p>
                        )}
                    </CardContent>
                    <CardFooter className="justify-end border-t pt-6 mt-6">
                        {canEdit && <Button onClick={handleSaveVelocityToml} disabled={isSavingVelocityToml}>{isSavingVelocityToml ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save velocity.toml</Button>}
                    </CardFooter>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2">
                            <FileText /> server.properties
                        </CardTitle>
                        <CardDescription>
                            Edit the main server properties. Changes require a restart to take effect.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingProperties ? (
                            <div className="flex justify-center items-center py-6">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="ml-2">Loading properties...</p>
                            </div>
                        ) : propertiesError ? (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Error Loading Properties</AlertTitle>
                                <AlertDescription>{propertiesError}</AlertDescription>
                            </Alert>
                        ) : serverProperties && Object.keys(serverProperties).length > 0 ? (
                            <Accordion type="multiple" defaultValue={['General']} className="w-full">
                                {Object.entries(propertyCategories).map(([categoryName, properties]) => {
                                    const propertiesInCategory = Object.entries(serverProperties)
                                        .filter(([key]) => properties.includes(key))
                                        .sort(([keyA], [keyB]) => properties.indexOf(keyA) - properties.indexOf(keyB));

                                    if (propertiesInCategory.length === 0) return null;

                                    return (
                                        <AccordionItem value={categoryName} key={categoryName}>
                                            <AccordionTrigger className="text-base font-semibold">{categoryName} Settings</AccordionTrigger>
                                            <AccordionContent className="pt-2">
                                                <Table>
                                                    <TableBody>
                                                        {propertiesInCategory.map(([key, value]) => (
                                                            <TableRow key={key}>
                                                                <TableCell className="font-medium w-1/3 align-top py-3">
                                                                    <Label htmlFor={`prop-${key}`}>{key}</Label>
                                                                </TableCell>
                                                                <TableCell className="w-2/3">
                                                                    {renderPropertyInput(key, value)}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                                {otherProperties.length > 0 && (
                                     <AccordionItem value="Other" key="Other">
                                        <AccordionTrigger className="text-base font-semibold">Other Settings</AccordionTrigger>
                                        <AccordionContent className="pt-2">
                                            <Table>
                                                <TableBody>
                                                    {otherProperties.map(([key, value]) => (
                                                        <TableRow key={key}>
                                                            <TableCell className="font-medium w-1/3 align-top py-3">
                                                                <Label htmlFor={`prop-${key}`}>{key}</Label>
                                                            </TableCell>
                                                            <TableCell className="w-2/3">
                                                                {renderPropertyInput(key, value)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </AccordionItem>
                                )}
                            </Accordion>
                        ) : (
                            <p className="text-muted-foreground text-center py-4">No `server.properties` file found. Saving will create one.</p>
                        )}
                    </CardContent>
                    <CardFooter className="justify-end border-t pt-6 mt-6">
                        {canEdit && (
                            <Button onClick={handleSaveProperties} disabled={isSavingProperties}>
                                {isSavingProperties ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save server.properties
                            </Button>
                        )}
                    </CardFooter>
                </Card>
            )}
        </TabsContent>

        <TabsContent value="file-manager">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2">
                <FolderIcon className="h-5 w-5" /> File Manager
              </CardTitle>
              <CardDescription>Browse and manage server files. Current path: <code>{currentFilePath}</code></CardDescription>
            </CardHeader>
            <CardContent>
              {canEdit && (
                <div className="mb-4 flex flex-wrap gap-2 items-center">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleGoUpDirectory} 
                    disabled={currentFilePath === "/"}
                  >
                    <ArrowUpCircle className="mr-2 h-4 w-4" /> Up
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowCreateFolderDialog(true)}>
                    <FolderPlus className="mr-2 h-4 w-4" /> Create Folder
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleTriggerUpload}>
                    <UploadCloud className="mr-2 h-4 w-4" /> Upload File
                  </Button>
                  <input type="file" ref={fileUploadRef} onChange={handleFileUpload} className="hidden" />
                </div>
              )}
              {isLoadingFiles ? (
                <div className="flex justify-center items-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-2">Loading files...</p>
                </div>
              ) : fileManagerError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error Loading Files</AlertTitle>
                  <AlertDescription>{fileManagerError}</AlertDescription>
                </Alert>
              ) : fileList.length === 0 && currentFilePath === "/" ? (
                <p className="text-muted-foreground text-center py-4">Server directory is empty or not accessible.</p>
              ) : fileList.length === 0 ? (
                 <p className="text-muted-foreground text-center py-4">This folder is empty.</p>
              ) : (
                <ScrollArea className="h-[400px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Size</TableHead>
                        <TableHead className="hidden lg:table-cell">Last Modified</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fileList.map((item) => (
                        <TableRow key={item.id} className={item.type === 'folder' ? 'cursor-pointer hover:bg-muted/50' : 'hover:bg-muted/50'}>
                          <TableCell onClick={() => handleItemClick(item)}>
                            {item.type === 'folder' ? <FolderIcon className="h-5 w-5 text-blue-500" /> : <FileIcon className="h-5 w-5 text-gray-500" />}
                          </TableCell>
                          <TableCell 
                            className="font-medium break-all cursor-pointer" 
                            onClick={() => handleItemClick(item)}
                          >
                            {item.name}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{item.size}</TableCell>
                          <TableCell className="hidden lg:table-cell">{new Date(item.lastModified).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {item.type === 'file' && isTextEditableFile(item.name) && (
                                <Button variant="ghost" size="icon" onClick={() => handleItemClick(item)} title="Edit File">
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                               {item.type === 'folder' && (
                                <Button variant="ghost" size="icon" onClick={() => handleItemClick(item)} title="Open Folder">
                                  <EyeIcon className="h-4 w-4" />
                                </Button>
                              )}
                              {canEdit && (
                                <>
                                <Button variant="ghost" size="icon" onClick={() => handleRenameItemInitiate(item)} title="Rename">
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteItemInitiate(item)} title="Delete">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="backups">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-headline flex items-center gap-2"><Archive /> Backup Management</CardTitle>
                <CardDescription>Manage server backups. Create new backups or restore from existing ones.</CardDescription>
              </div>
              {canEdit && <Button size="sm" onClick={handleCreateBackup} disabled={isCreatingBackup}><PlusCircle className="mr-2 h-4 w-4" />Create Backup</Button>}
            </CardHeader>
            <CardContent>
              {isLoadingBackups ? (
                 <div className="flex justify-center items-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-2">Loading backups...</p>
                </div>
              ) : backups.length === 0 ? (
                <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
                  <ListX className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-medium">No Backups Found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create your first backup to protect your server data.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Backup File</TableHead>
                        <TableHead className="hidden sm:table-cell">Size</TableHead>
                        <TableHead className="hidden md:table-cell">Created At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backups.map((backup) => (
                        <TableRow key={backup.fileName}>
                          <TableCell className="font-medium">{backup.fileName}</TableCell>
                          <TableCell className="hidden sm:table-cell">{backup.size}</TableCell>
                          <TableCell className="hidden md:table-cell">{format(new Date(backup.createdAt), "yyyy-MM-dd HH:mm")}</TableCell>
                          <TableCell className="text-right">
                           {canEdit && (
                            <div className="flex gap-1 justify-end">
                                <Button variant="outline" size="sm" onClick={() => setBackupToRestore(backup)} disabled={isRestoringBackup || isDeletingBackup}>
                                    <ArchiveRestore className="mr-2 h-4 w-4"/> Restore
                                </Button>
                                <a href={`/api/minecraft/servers/${serverId}/backups/${backup.fileName}/download`} download>
                                    <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4"/> Download</Button>
                                </a>
                                <Button variant="destructive" size="sm" onClick={() => setBackupToDelete(backup)} disabled={isRestoringBackup || isDeletingBackup}>
                                    <Trash2 className="mr-2 h-4 w-4"/> Delete
                                </Button>
                            </div>
                           )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plugins">
          <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                      <CardTitle className="font-headline flex items-center gap-2"><Puzzle /> Plugin Management</CardTitle>
                      <CardDescription>
                          Enable, disable, or uninstall plugins for this server.
                      </CardDescription>
                  </div>
                  {canManagePlugins && (
                    <Link href="/plugins" passHref>
                      <Button size="sm">
                          <PlusCircle className="mr-2 h-4 w-4" /> Browse & Install Plugins
                      </Button>
                    </Link>
                  )}
              </CardHeader>
              <CardContent>
                  {isLoadingPlugins ? (
                      <div className="flex justify-center items-center py-6">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="ml-2">Loading plugins...</p>
                      </div>
                  ) : plugins.length === 0 ? (
                      <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
                          <ListX className="mx-auto h-12 w-12 text-muted-foreground" />
                          <h3 className="mt-4 text-lg font-medium">No Plugins Found</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                              The plugins folder is empty. Install a plugin to get started.
                          </p>
                      </div>
                  ) : (
                      <Table>
                          <TableHeader>
                              <TableRow>
                                  <TableHead>Plugin Name</TableHead>
                                  <TableHead className="hidden md:table-cell">Version</TableHead>
                                  <TableHead>Status</TableHead>
                                  {canManagePlugins && <TableHead className="text-right">Actions</TableHead>}
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {plugins.map((plugin) => (
                                  <TableRow key={plugin.fileName}>
                                      <TableCell className="font-medium">{plugin.name}</TableCell>
                                      <TableCell className="hidden md:table-cell">{plugin.version}</TableCell>
                                      <TableCell>
                                          {pluginActionStates[plugin.fileName] ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                              <div className="flex items-center gap-2">
                                                  <Switch
                                                      checked={plugin.isEnabled}
                                                      onCheckedChange={() => handleTogglePlugin(plugin)}
                                                      disabled={!canManagePlugins || pluginActionStates[plugin.fileName]}
                                                      aria-label={`Toggle ${plugin.name}`}
                                                  />
                                                  <span className="text-xs text-muted-foreground">{plugin.isEnabled ? "Enabled" : "Disabled"}</span>
                                              </div>
                                          )}
                                      </TableCell>
                                      {canManagePlugins && (
                                          <TableCell className="text-right">
                                              <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => setPluginToUninstall(plugin)}
                                                  disabled={pluginActionStates[plugin.fileName] || isUninstalling}
                                                  title={`Uninstall ${plugin.name}`}
                                              >
                                                  <Trash2 className="h-4 w-4 text-destructive" />
                                              </Button>
                                          </TableCell>
                                      )}
                                  </TableRow>
                              ))}
                          </TableBody>
                      </Table>
                  )}
              </CardContent>
              <CardFooter>
                  <p className="text-xs text-muted-foreground">Changes to plugins require a server restart to take effect.</p>
              </CardFooter>
            </Card>
        </TabsContent>
      </Tabs>

      {/* File Editor Dialog */}
      <Dialog open={showEditFileDialog} onOpenChange={setShowEditFileDialog}>
        <DialogContent className="sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit File: {editingFile?.name}</DialogTitle>
            <DialogDescription>Path: {editingFile?.path}</DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-hidden">
            {isLoadingFileContent ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading file content...</p>
              </div>
            ) : (
              <Textarea
                value={editingFileContent}
                onChange={(e) => setEditingFileContent(e.target.value)}
                className="font-code text-xs leading-relaxed bg-background h-full w-full resize-none"
                placeholder="File content..."
                disabled={!canEdit}
              />
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            {canEdit && (
              <Button type="button" onClick={handleSaveFileContent} disabled={isSavingFile || isLoadingFileContent}>
                {isSavingFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder in <code>{currentFilePath}</code></DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="newFolderName">Folder Name</Label>
            <Input 
              id="newFolderName" 
              value={newFolderName} 
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., my-new-folder" 
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName.trim()}>
              {isCreatingFolder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Item Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Item</DialogTitle>
            <DialogDescription>Rename "{itemToRename?.name}" in <code>{itemToRename ? (itemToRename.path.substring(0, itemToRename.path.lastIndexOf(itemToRename.name)) || "/") : ""}</code></DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="newItemNameInput">New Name</Label>
            <Input 
              id="newItemNameInput" 
              value={newItemNameInput} 
              onChange={(e) => setNewItemNameInput(e.target.value)}
              placeholder="Enter new name" 
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={handleConfirmRename} disabled={isRenamingItem || !newItemNameInput.trim()}>
              {isRenamingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit3 className="mr-2 h-4 w-4" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Alert Dialog */}
      {itemToDelete && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the 
                {itemToDelete.type === 'folder' ? ' folder ' : ' file '} 
                <strong>"{itemToDelete.name}"</strong> and all its contents (if a folder).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingItem}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeletingItem} className="bg-destructive hover:bg-destructive/90">
                {isDeletingItem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Restore Backup Alert Dialog */}
      {backupToRestore && (
        <AlertDialog open={!!backupToRestore} onOpenChange={() => setBackupToRestore(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore from Backup?</AlertDialogTitle>
              <AlertDialogDescription>
                You are about to restore from <strong>{backupToRestore.fileName}</strong>. This action will
                completely overwrite the current server files. This cannot be undone.
                <br/><br/>
                <strong>The server must be offline to perform a restore.</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRestoringBackup} onClick={() => setBackupToRestore(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRestoreBackup} disabled={isRestoringBackup || server?.status !== 'Offline'}>
                {isRestoringBackup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {server?.status !== 'Offline' ? "Server must be offline" : "Confirm Restore"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete Backup Alert Dialog */}
      {backupToDelete && (
        <AlertDialog open={!!backupToDelete} onOpenChange={() => setBackupToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete the backup file <strong>{backupToDelete.fileName}</strong>? 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingBackup} onClick={() => setBackupToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteBackup} disabled={isDeletingBackup} className="bg-destructive hover:bg-destructive/90">
                {isDeletingBackup ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Uninstall Plugin Alert Dialog */}
      {pluginToUninstall && (
          <AlertDialog open={!!pluginToUninstall} onOpenChange={() => setPluginToUninstall(null)}>
              <AlertDialogContent>
                  <AlertDialogHeader>
                      <AlertDialogTitle>Uninstall Plugin?</AlertDialogTitle>
                      <AlertDialogDescription>
                          Are you sure you want to permanently delete <strong>{pluginToUninstall.fileName}</strong>? This action cannot be undone.
                      </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                      <AlertDialogCancel disabled={isUninstalling} onClick={() => setPluginToUninstall(null)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleUninstallPlugin} disabled={isUninstalling} className="bg-destructive hover:bg-destructive/90">
                          {isUninstalling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Uninstall
                      </AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
          </AlertDialog>
      )}

    </div>
  );
}
    
