"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ConfigCodeBlockProps {
  title: string;
  language?: string;
  code: string;
  maxHeight?: string;
}

export function ConfigCodeBlock({ title, language = "plaintext", code, maxHeight = "400px" }: ConfigCodeBlockProps) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard!", description: `${title} configuration copied.`});
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error("Failed to copy: ", err);
      toast({ title: "Copy Failed", description: "Could not copy configuration to clipboard.", variant: "destructive" });
    });
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b">
        <CardTitle className="text-lg font-semibold font-headline">{title}</CardTitle>
        <Button variant="ghost" size="icon" onClick={handleCopy} aria-label={`Copy ${title} configuration`}>
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ maxHeight }} className="rounded-b-lg">
          <pre className={`language-${language} p-4 text-sm bg-muted/30 overflow-x-auto font-code`}>
            <code className={`language-${language}`}>{code}</code>
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
