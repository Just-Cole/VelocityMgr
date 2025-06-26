"use client";

import * as React from "react";
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
import { MOCK_TEMPLATES } from "@/lib/constants";
import type { ProxyTemplate } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2 } from "lucide-react";

const proxySchema = z.object({
  name: z.string().min(3, "Proxy name must be at least 3 characters"),
  port: z.coerce.number().int().min(1024, "Port must be between 1024 and 65535").max(65535),
  templateId: z.string().min(1, "Please select a template"),
});

type ProxyFormData = z.infer<typeof proxySchema>;

export default function CreateProxyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProxyFormData>({
    resolver: zodResolver(proxySchema),
    defaultValues: {
      name: "",
      port: 25565,
      templateId: MOCK_TEMPLATES[0]?.id || "",
    },
  });

  const onSubmit = async (data: ProxyFormData) => {
    setIsLoading(true);
    console.log("Creating proxy with data:", data);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // In a real app, you would add the new proxy to your state/DB
    // and then redirect or show a success message.
    toast({
      title: "Proxy Creation Initiated",
      description: `Proxy "${data.name}" is being created with template ID ${data.templateId}.`,
      variant: "default",
    });
    setIsLoading(false);
    router.push("/dashboard"); // Redirect to dashboard after creation
  };

  return (
    <div className="container mx-auto py-2">
      <PageHeader title="Create New Proxy" description="Set up a new Velocity proxy using a template." />
      
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline">Proxy Details</CardTitle>
          <CardDescription>Fill in the information below to create your new proxy.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <Label htmlFor="name">Proxy Name</Label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <Input id="name" placeholder="e.g., My Awesome Proxy" {...field} className="mt-1" />
                )}
              />
              {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <Label htmlFor="port">Port Number</Label>
              <Controller
                name="port"
                control={control}
                render={({ field }) => (
                  <Input id="port" type="number" placeholder="e.g., 25565" {...field} className="mt-1" />
                )}
              />
              {errors.port && <p className="text-sm text-destructive mt-1">{errors.port.message}</p>}
            </div>

            <div>
              <Label htmlFor="templateId">Proxy Template</Label>
              <Controller
                name="templateId"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger id="templateId" className="mt-1">
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {MOCK_TEMPLATES.map((template: ProxyTemplate) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} - {template.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.templateId && <p className="text-sm text-destructive mt-1">{errors.templateId.message}</p>}
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Create Proxy
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
