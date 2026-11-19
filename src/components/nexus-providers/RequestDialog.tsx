import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RequestForm } from '@/components/nexus-providers/RequestForm';
import type { RequestCreateInput, RequestKind } from '@/types/nexus-requests';

export interface RequestDialogProps {
  /** `null` = fechado. */
  open: { kind: RequestKind; message: string } | null;
  onClose: () => void;
  onSubmit: (input: RequestCreateInput) => Promise<void>;
}

/** "Solicitar" de um provedor ou aba: abre o mesmo formulário, já com tipo e mensagem sugeridos. */
export function RequestDialog({ open, onClose, onSubmit }: RequestDialogProps) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar ao gestor</DialogTitle>
          <DialogDescription>O gestor recebe o seu pedido e responde na aba Solicitações. Conexões e chaves são feitas só por ele.</DialogDescription>
        </DialogHeader>
        <RequestForm idPrefix="req-dialog" defaultKind={open.kind} defaultMessage={open.message} onSubmit={onSubmit} onSent={onClose} />
      </DialogContent>
    </Dialog>
  );
}
