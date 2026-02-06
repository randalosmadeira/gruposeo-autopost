import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { XCircle, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueueItem {
  id: number;
  action: string;
  status: string;
  error_message?: string;
}

interface QueueNotificationsProps {
  items: QueueItem[];
  enabled: boolean;
  onToggle: () => void;
}

export function useQueueNotifications(
  currentItems: QueueItem[] | undefined,
  enabled: boolean
) {
  const previousItemsRef = useRef<Map<number, string>>(new Map());
  const notifiedFailuresRef = useRef<Set<number>>(new Set());

  const checkForNewFailures = useCallback(() => {
    if (!enabled || !currentItems) return;

    currentItems.forEach((item) => {
      const previousStatus = previousItemsRef.current.get(item.id);
      
      // Check if this item just failed (status changed to 'failed')
      if (
        item.status === 'failed' &&
        previousStatus !== 'failed' &&
        !notifiedFailuresRef.current.has(item.id)
      ) {
        // Mark as notified to avoid duplicate notifications
        notifiedFailuresRef.current.add(item.id);
        
        // Show toast notification
        toast.error(
          <div className="flex flex-col gap-1">
            <div className="font-semibold flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Falha na Fila
            </div>
            <div className="text-sm opacity-90">
              {item.action}
            </div>
            {item.error_message && (
              <div className="text-xs opacity-75 mt-1 line-clamp-2">
                {item.error_message}
              </div>
            )}
          </div>,
          {
            duration: 8000,
            id: `queue-failure-${item.id}`,
          }
        );

        // Try to show browser notification if permitted
        showBrowserNotification(item);
      }
    });

    // Update previous items map
    const newMap = new Map<number, string>();
    currentItems.forEach((item) => {
      newMap.set(item.id, item.status);
    });
    previousItemsRef.current = newMap;

    // Clean up old notified failures (keep only recent ones)
    if (notifiedFailuresRef.current.size > 100) {
      const oldIds = Array.from(notifiedFailuresRef.current).slice(0, 50);
      oldIds.forEach((id) => notifiedFailuresRef.current.delete(id));
    }
  }, [currentItems, enabled]);

  useEffect(() => {
    checkForNewFailures();
  }, [checkForNewFailures]);

  return { checkForNewFailures };
}

async function showBrowserNotification(item: QueueItem) {
  // Check if browser notifications are supported and permitted
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification("ContentFactory - Falha na Fila", {
      body: `${item.action}\n${item.error_message || "Erro desconhecido"}`,
      icon: "/favicon.png",
      tag: `queue-failure-${item.id}`,
    });
  }
}

export function NotificationToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Notificações não são suportadas neste navegador");
      return;
    }

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        toast.success("Notificações ativadas!");
        onToggle();
      } else {
        toast.error("Permissão para notificações negada");
      }
    } else if (Notification.permission === "granted") {
      onToggle();
    } else {
      toast.error("Notificações bloqueadas. Habilite nas configurações do navegador.");
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={enabled ? onToggle : requestNotificationPermission}
      className={enabled ? "text-primary" : "text-muted-foreground"}
      title={enabled ? "Desativar notificações de falha" : "Ativar notificações de falha"}
    >
      {enabled ? (
        <>
          <Bell className="w-4 h-4 mr-2" />
          Alertas
        </>
      ) : (
        <>
          <BellOff className="w-4 h-4 mr-2" />
          Alertas
        </>
      )}
    </Button>
  );
}

export function QueueNotificationBanner({ failedCount }: { failedCount: number }) {
  if (failedCount === 0) return null;

  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center gap-3">
      <div className="p-2 rounded-full bg-destructive/20">
        <XCircle className="w-5 h-5 text-destructive" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-destructive">
          {failedCount} {failedCount === 1 ? 'item falhou' : 'itens falharam'} na fila
        </p>
        <p className="text-sm text-muted-foreground">
          Verifique os erros e tente reprocessar os itens afetados
        </p>
      </div>
    </div>
  );
}
