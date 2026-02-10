import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCircle2, ExternalLink, X, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CronNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

export function CronNotificationsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<CronNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user]);

  async function fetchNotifications() {
    const { data } = await supabase
      .from('cron_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10) as { data: CronNotification[] | null };
    
    setNotifications(data || []);
    setLoading(false);
  }

  async function markAsRead(id: string) {
    await supabase
      .from('cron_notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase
      .from('cron_notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading || notifications.length === 0) return null;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notificações Automáticas
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs px-2 py-0.5">
                {unreadCount} nova{unreadCount > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Marcar todas
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {notifications.slice(0, 5).map(notif => (
          <div
            key={notif.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
              notif.is_read
                ? 'bg-muted/30 border-border/50'
                : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
            )}
            onClick={() => {
              markAsRead(notif.id);
              if (notif.metadata?.article_id) {
                navigate(`/articles/${notif.metadata.article_id}/edit`);
              }
            }}
          >
            <div className={cn(
              'p-2 rounded-lg shrink-0',
              notif.is_read ? 'bg-muted' : 'bg-primary/10'
            )}>
              <Newspaper className={cn('w-4 h-4', notif.is_read ? 'text-muted-foreground' : 'text-primary')} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-sm font-medium truncate',
                notif.is_read ? 'text-muted-foreground' : 'text-foreground'
              )}>
                {notif.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(notif.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
                {notif.metadata?.originality_score && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {notif.metadata.originality_score}% original
                  </Badge>
                )}
                {notif.metadata?.portal_name && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {notif.metadata.portal_name}
                  </Badge>
                )}
              </div>
            </div>
            {!notif.is_read && (
              <button
                onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {notifications.length > 5 && (
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => navigate('/news-rewriter')}>
            Ver todas as notificações
            <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
