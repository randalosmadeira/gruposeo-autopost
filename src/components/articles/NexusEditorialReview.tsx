import {useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Card,CardContent} from '@/components/ui/card';
export function NexusEditorialReview({articleId,projectId}:{articleId:string;updatedAt:string;projectId:string}){
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function prepare(){setBusy(true);try{const {data,error}=await supabase.functions.invoke('nexus-intelligence',{body:{action:'prepare',kind:'editorial_review',articleId,projectId}});if(error||!data?.operation?.id)throw new Error();setMessage('Avaliação autônoma preparada. Serviços pagos bloqueados globalmente: nenhuma IA foi acionada e o artigo não foi aprovado.');}catch{setMessage('Não foi possível preparar a avaliação. Confira o projeto e tente novamente.');}finally{setBusy(false);}}
 return <Card className="mb-6 border-primary/25"><CardContent className="space-y-4 p-5"><h2 className="text-lg font-semibold">NEXUS · Revisão autônoma</h2><p className="text-sm text-muted-foreground">A revisão considera nicho, público, fontes, oferta, posicionamento e conversão. Serviços pagos estão bloqueados globalmente. Preparação não representa avaliação ou aprovação.</p><Button disabled={busy||!projectId} onClick={prepare}>Preparar revisão autônoma sem gasto</Button><Button asChild variant="outline"><Link to={`/business-profile?project=${projectId}`}>Conferir estratégia do negócio</Link></Button>{message&&<p role="status">{message}</p>}</CardContent></Card>;
}
