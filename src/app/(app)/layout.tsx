
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import {
  LayoutDashboard,
  PlusCircle,
  Settings2,
  Menu,
  Users,
  ArchiveRestore,
  KeyRound,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSidebar } from "@/components/ui/sidebar";
import AppLogoIcon from "@/components/app-logo-icon";
import { useToast } from "@/hooks/use-toast";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, requiredPermission: "view_server_stats" },
  { href: "/servers/create", label: "Create Server", icon: PlusCircle, requiredPermission: "create_servers" },
  { href: "/settings", label: "Settings", icon: Settings2, requiredPermission: "manage_roles" },
  { href: "/settings/users", label: "User Management", icon: Users, requiredPermission: "assign_roles" },
  { href: "/settings/roles", label: "Role Management", icon: KeyRound, requiredPermission: "manage_roles" },
  { href: "/settings/recovery", label: "Recovery", icon: ArchiveRestore, requiredPermission: "manage_recovery" },
];

const SidebarNavigationContent = () => {
  const pathname = usePathname();
  const { toast } = useToast();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out.",
      variant: "default",
    });
  };

  const filteredNavItems = navItems.filter(item => 
    user?.permissions?.includes(item.requiredPermission)
  );

  // This logic finds the nav item that is the "best" match for the current URL.
  // The best match is the one with the longest href that is a prefix of the current path.
  // This prevents both "Settings" and "Role Management" from being active at the same time.
  const bestMatchHref = React.useMemo(() => {
    let bestMatch = "";
    if (!filteredNavItems) return bestMatch;

    for (const item of filteredNavItems) {
        if (pathname.startsWith(item.href)) {
            if (item.href.length > bestMatch.length) {
                bestMatch = item.href;
            }
        }
    }
    return bestMatch;
  }, [pathname, filteredNavItems]);


  return (
    <>
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <AppLogoIcon className="h-8 w-8" />
          <h1 className="text-xl font-semibold font-headline">{APP_NAME}</h1>
        </Link>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <ScrollArea className="h-full">
        <SidebarMenu>
          {filteredNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href}>
                <SidebarMenuButton
                  isActive={item.href === bestMatchHref}
                  tooltip={item.label}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <SidebarSeparator className="my-2" />
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                className="flex items-center gap-3 w-full text-left p-2 rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                    {user?.username?.[0].toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col flex-grow overflow-hidden">
                    <span className="text-sm font-semibold truncate" title={user?.username}>
                    {user?.username}
                    </span>
                    <span className="text-xs text-muted-foreground">Manage Account</span>
                </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.username}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                        {user?.roles?.join(', ')}
                    </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/profile">
                        <UserIcon className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </>
  );
};

function AppMainArea({ children }: { children: React.ReactNode }) {
  const { isMobile, toggleSidebar } = useSidebar();

  if (isMobile) {
    return (
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <AppLogoIcon className="h-7 w-7" />
            <span className="text-lg font-semibold font-headline">{APP_NAME}</span>
          </Link>
          <Button variant="outline" size="icon" className="shrink-0 md:hidden" onClick={toggleSidebar}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 md:p-6">
          {children}
        </main>
      </div>
    );
  }

  // Desktop
  return (
    <SidebarInset>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 sm:px-6 sm:py-0 md:gap-8 md:p-6">
        {children}
      </main>
    </SidebarInset>
  );
}


function AppLayoutContent({ children }: { children: React.ReactNode }) {
  return (
     <SidebarProvider defaultOpen={true}>
      <Sidebar side="left" variant="sidebar" collapsible="icon">
        <SidebarNavigationContent />
      </Sidebar>
      <AppMainArea>{children}</AppMainArea>
    </SidebarProvider>
  )
}


export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </AuthProvider>
  );
}
