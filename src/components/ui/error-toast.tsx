import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface ErrorToastContentProps {
  title: string;
  description: string;
  requestId?: string;
}

/**
 * Error toast content component that displays error details
 * and optionally shows a copyable request ID for support.
 */
export function ErrorToastContent({ title, description, requestId }: ErrorToastContentProps) {
  const [copied, setCopied] = useState(false);

  const copyRequestId = async () => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = requestId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">{description}</div>
      {requestId && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">ID para suporte:</span>
          <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">
            {requestId}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={copyRequestId}
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Helper to show an error toast with optional request ID.
 * Use this instead of raw toast() for backend errors.
 */
export function createErrorToastContent(
  title: string,
  description: string,
  requestId?: string
) {
  return {
    title: requestId ? undefined : title,
    description: requestId ? (
      <ErrorToastContent title={title} description={description} requestId={requestId} />
    ) : (
      description
    ),
    variant: "destructive" as const,
  };
}
