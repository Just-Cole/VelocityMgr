
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/contexts/ThemeContext";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="container mx-auto py-2">
      <PageHeader title="Application Settings" description="Manage your preferences and application configuration." />

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2"><Palette /> Appearance</CardTitle>
            <CardDescription>Customize the look and feel of the application by selecting a theme.</CardDescription>
          </CardHeader>
          <CardContent>
             <RadioGroup
              value={theme}
              onValueChange={setTheme}
              className="grid max-w-md grid-cols-1 gap-8 pt-2 sm:grid-cols-3"
            >
              <Label className={cn("cursor-pointer rounded-md border-2 p-1 transition-colors", theme === 'light' ? 'border-primary' : 'border-muted hover:border-accent')}>
                <RadioGroupItem value="light" className="sr-only" />
                <div className="items-center rounded-md bg-[#ecedef] p-2">
                  <div className="space-y-2 rounded-sm p-2">
                    <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
                      <div className="h-2 w-4/5 rounded-lg bg-[#ecedef]" />
                      <div className="h-2 w-full rounded-lg bg-[#ecedef]" />
                    </div>
                    <div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                      <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                      <div className="h-2 w-full rounded-lg bg-[#ecedef]" />
                    </div>
                  </div>
                </div>
                <span className="block w-full p-2 text-center font-normal">
                  Light
                </span>
              </Label>
              <Label className={cn("cursor-pointer rounded-md border-2 p-1 transition-colors", theme === 'dark' ? 'border-primary' : 'border-muted hover:border-accent')}>
                <RadioGroupItem value="dark" className="sr-only" />
                 <div className="items-center rounded-md bg-slate-900 p-2">
                    <div className="space-y-2 rounded-sm bg-slate-800 p-2">
                      <div className="space-y-2 rounded-md bg-slate-700 p-2 shadow-sm">
                        <div className="h-2 w-4/5 rounded-lg bg-slate-400" />
                        <div className="h-2 w-full rounded-lg bg-slate-400" />
                      </div>
                      <div className="flex items-center space-x-2 rounded-md bg-slate-700 p-2 shadow-sm">
                        <div className="h-4 w-4 rounded-full bg-slate-400" />
                        <div className="h-2 w-full rounded-lg bg-slate-400" />
                      </div>
                    </div>
                  </div>
                <span className="block w-full p-2 text-center font-normal">
                  Dark
                </span>
              </Label>
               <Label className={cn("cursor-pointer rounded-md border-2 p-1 transition-colors", theme === 'system' ? 'border-primary' : 'border-muted hover:border-accent')}>
                <RadioGroupItem value="system" className="sr-only" />
                 <div className="items-center rounded-md border-2 border-dashed bg-background p-1">
                    <div className="flex h-[98px] w-full items-center justify-center">
                        <span className="font-semibold text-muted-foreground">System</span>
                    </div>
                  </div>
                <span className="block w-full p-2 text-center font-normal">
                  System
                </span>
              </Label>
            </RadioGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
