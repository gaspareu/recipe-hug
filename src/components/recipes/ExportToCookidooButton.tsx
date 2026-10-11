import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, Loader2, ExternalLink } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCookidooConnector } from '@/hooks/useCookidooConnector';
import { useCookidooExport, CookidooError } from '@/hooks/useCookidooExport';
import { cookidooErrorMessage, COOKIDOO_WARNINGS } from '@/lib/cookidoo-messages';

interface Props { recipeId: string; open?: boolean; onOpenChange?: (open: boolean) => void; showTrigger?: boolean }
export function ExportToCookidooButton({ recipeId, open: controlledOpen, onOpenChange, showTrigger = true }: Props) {
  const { status } = useCookidooConnector();
  const flow = useCookidooExport(recipeId, status.data?.configured === true);
  const { adaptation, job, refresh } = flow;
  const [internalOpen, setInternalOpen] = useState(false);
  const [water, setWater] = useState('');
  const [clarifications, setClarifications] = useState('');
  const [replaceJob, setReplaceJob] = useState<string | null>(null);
  const [recreateJob, setRecreateJob] = useState<string | null>(null);
  const [absentJob, setAbsentJob] = useState<string | null>(null);
  const replaceRemote = job?.status === 'failed' && job.error_code === 'remote_changed' && replaceJob === job.id;
  const recreateRemote = job?.status === 'failed' && ['destination_missing', 'partial_created'].includes(job.error_code ?? '') && recreateJob === job.id;
  const confirmedAbsent = job?.status === 'unknown' && absentJob === job.id;
  const [lastError, setLastError] = useState<string | null>(null);
  const notified = useRef(new Set<string>());
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => { if (value) void flow.refresh(); if (controlledOpen === undefined) setInternalOpen(value); onOpenChange?.(value); };
  const busy = flow.prepare.isPending || flow.send.isPending || adaptation?.status === 'preparing' || job?.status === 'pending';

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  // Une notification par résultat, y compris après reprise sur une autre page.
  useEffect(() => {
    if (!job || job.status === 'pending' || notified.current.has(job.id + job.status)) return;
    notified.current.add(job.id + job.status);
    const seenKey = `cookidoo-notified:${job.id}:${job.status}`;
    if (sessionStorage.getItem(seenKey)) return;
    sessionStorage.setItem(seenKey, '1');
    if (job.status === 'success') {
      const important = (job.warnings ?? []).filter(w => !['no_image', 'image_not_transferred'].includes(w));
      const notify = important.length ? toast.warning : toast.success;
      notify(important.length ? 'Recette envoyée, des points sont à vérifier' : job.updated ? 'Recette mise à jour sur Cookidoo' : 'Recette disponible sur Cookidoo', {
        description: important.length ? 'Vérifiez les détails de l’envoi avant de cuisiner.' : 'Retrouvez-la dans « Mes recettes créées » pour la cuisiner.',
        action: job.cookidoo_url ? { label: 'Ouvrir Cookidoo', onClick: () => window.open(job.cookidoo_url!, '_blank', 'noopener,noreferrer') } : undefined,
      });
    } else if (job.status === 'unknown') {
      toast.warning('Le résultat de l’envoi n’est pas encore confirmé', { description: 'Consultez Cookidoo avant de relancer.' });
    } else {
      toast.error('La recette n’a pas pu être envoyée', { description: cookidooErrorMessage(job.error_code) });
    }
  }, [job]);

  async function perform(action: () => Promise<unknown>, title: string) {
    setLastError(null);
    try { await action(); }
    catch (error) {
      const message = cookidooErrorMessage(error instanceof CookidooError ? error.code : null);
      setLastError(message);
      toast.error(title, { description: message });
    }
  }
  const summary = job?.status === 'pending' ? job.phase === 'verifying' ? 'Vérification sur Cookidoo…' : 'Envoi vers Cookidoo…'
    : adaptation?.status === 'preparing' ? 'Adaptation pour votre TM7…'
    : job?.status === 'unknown' ? 'Résultat de l’envoi à vérifier'
    : job?.status === 'success' ? (job.adaptation_id && job.adaptation_id !== adaptation?.id ? 'Version précédente disponible sur Cookidoo' : 'Disponible sur Cookidoo')
    : adaptation?.status === 'ready' ? 'Version Cookidoo prête' : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!showTrigger && summary && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <p role="status" aria-live="polite">{summary}</p>
        <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>Voir la version Cookidoo</Button>
      </div>}
      {showTrigger && <Tooltip><TooltipTrigger asChild><DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 bg-background/60 backdrop-blur-xs hover:bg-background/80" aria-label={summary ? `Cookidoo : ${summary}` : 'Envoyer vers Cookidoo'}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <UtensilsCrossed className="h-4 w-4" />}
        </Button>
      </DialogTrigger></TooltipTrigger><TooltipContent><p>{summary ?? 'Envoyer vers Cookidoo'}</p></TooltipContent></Tooltip>}
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Envoyer vers Cookidoo</DialogTitle><DialogDescription>
          Nous adaptons une copie de cette recette pour votre Thermomix TM7. Votre recette dans le Livre reste inchangée. Vous pourrez ensuite la suivre dans Cookidoo.
        </DialogDescription></DialogHeader>
        {status.isLoading || flow.isLoading ? <p role="status">Chargement…</p> : !status.data?.configured ? <div className="space-y-3 text-sm">
          <p>Connectez votre compte Cookidoo pour envoyer cette recette.</p><Button asChild variant="outline"><Link to="/profile">Connecter Cookidoo</Link></Button>
        </div> : <div className="space-y-4 text-sm">
          {summary && <p role="status" aria-live="polite" className="font-medium">{summary}</p>}
          {flow.unavailable && <p role="alert">{cookidooErrorMessage('backend_updating')}</p>}
          {(lastError || flow.error) && <div role="alert" className="space-y-2"><p>{lastError ?? cookidooErrorMessage('connection_unknown')}</p><Button variant="outline" onClick={() => void flow.refresh()}>Actualiser l’état</Button></div>}
          {adaptation?.status === 'ready' && <p className="text-muted-foreground">Cette version est conservée pour vos prochains envois. {adaptation.reused ? 'Aucune nouvelle adaptation n’est nécessaire.' : ''}</p>}
          {adaptation?.recipe && <div className="space-y-3">
            <p className="font-medium">Version pour Cookidoo</p>
            <p>{adaptation.guided_steps} étape(s) avec commandes TM7 sur {adaptation.recipe.steps.length}.</p>
            {adaptation.changes.length > 0 && <details open><summary className="cursor-pointer py-2">Ce qui a été adapté</summary><ul className="list-disc space-y-1 pl-5">{adaptation.changes.map((s, i) => <li key={i}>{s}</li>)}</ul></details>}
            <details><summary className="cursor-pointer py-2">Ingrédients et mesures</summary><ul className="list-disc space-y-1 pl-5">{adaptation.ingredients.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
            <details open><summary className="cursor-pointer py-2">Étapes à envoyer</summary><ol className="list-decimal space-y-3 pl-5">{adaptation.recipe.steps.map(s => <li key={s.order} className="whitespace-pre-line">{s.text}</li>)}</ol></details>
            {adaptation.notes.length > 0 && <ul className="list-disc space-y-1 pl-5">{adaptation.notes.map((s, i) => <li key={i}>{s}</li>)}</ul>}
            <p className="text-muted-foreground">Vérifiez les réglages proposés avant l’envoi. Les actions manuelles restent à réaliser à la main.</p>
          </div>}
          {adaptation?.status === 'needs_input' && <div className="space-y-3 rounded-md border p-3">
            <p className="font-medium">Une précision manque</p><ul className="list-disc pl-5">{adaptation.blockers.map((s, i) => <li key={i}>{s}</li>)}</ul>
            <Label htmlFor={`water-${recipeId}`}>Eau dans le bol pour produire la vapeur, si nécessaire (ml)</Label><Input id={`water-${recipeId}`} type="number" min="100" max="2000" inputMode="numeric" placeholder={adaptation.request_context?.technical_water_ml ? String(adaptation.request_context.technical_water_ml) : undefined} value={water} onChange={e => setWater(e.target.value)} />
            <Label htmlFor={`clarification-${recipeId}`}>Précisions pour cette version Cookidoo</Label><Textarea id={`clarification-${recipeId}`} maxLength={2000} value={clarifications} onChange={e => setClarifications(e.target.value)} />
            <p>Ces précisions concernent uniquement la copie Cookidoo.</p>
            {adaptation.request_context?.technical_water_ml && <p>Eau déjà précisée : {adaptation.request_context.technical_water_ml} ml.</p>}
            {adaptation.request_context?.clarifications?.map((text, i) => <p key={i}>Précision conservée : {text}</p>)}
            <Button disabled={busy || (!water && !clarifications.trim())} onClick={() => void perform(() => flow.prepare.mutateAsync({ ...(water ? { technical_water_ml: Number(water) } : {}), clarifications: clarifications.trim() }), 'Adaptation impossible pour le moment')}>Compléter la version</Button>
          </div>}
          {adaptation?.status === 'failed' && <p role="alert">{cookidooErrorMessage(adaptation.error_code)}</p>}
          {job?.status === 'failed' && <div role="alert" className="space-y-2"><p>{cookidooErrorMessage(job.error_code)}</p>
            {job.error_code === 'remote_changed' && <Label className="flex items-start gap-2"><input type="checkbox" checked={replaceRemote} onChange={e => setReplaceJob(e.target.checked ? job.id : null)} />Remplacer les modifications faites dans Cookidoo par cette version.</Label>}
            {['destination_missing', 'partial_created'].includes(job.error_code ?? '') && <Label className="flex items-start gap-2"><input type="checkbox" checked={recreateRemote} onChange={e => setRecreateJob(e.target.checked ? job.id : null)} />J’ai vérifié que la recette précédente est supprimée. Créer une nouvelle recette dans Cookidoo.</Label>}
          </div>}
          {job?.status === 'success' && (job.warnings ?? []).filter(w => w !== 'no_image').length > 0 && <div className="space-y-2"><p className="font-medium">Détails de l’envoi</p><ul className="list-disc pl-5">{job.warnings.filter(w => w !== 'no_image').map(w => <li key={w}>{COOKIDOO_WARNINGS[w] ?? 'Un point de cet envoi reste à vérifier dans Cookidoo.'}</li>)}</ul></div>}
          {job?.cookidoo_url && <Button asChild variant="outline"><a href={job.cookidoo_url} target="_blank" rel="noopener noreferrer">Ouvrir dans Cookidoo <ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
          {job?.status === 'unknown' ? <div className="space-y-3">
            <p>{cookidooErrorMessage('result_unknown')}</p><Button variant="outline" disabled={flow.check.isPending} onClick={() => void perform(() => flow.check.mutateAsync(), 'Envoi encore à vérifier')}>Vérifier l’envoi</Button>
            <Label className="flex items-start gap-2"><input type="checkbox" checked={confirmedAbsent} onChange={e => setAbsentJob(e.target.checked ? job.id : null)} />J’ai vérifié dans Cookidoo : cette tentative n’a créé ni modifié de recette.</Label>
            <Button variant="outline" disabled={!confirmedAbsent || flow.acknowledgeAbsent.isPending} onClick={() => void perform(() => flow.acknowledgeAbsent.mutateAsync(), 'Vérification impossible')}>Confirmer l’absence d’envoi</Button>
          </div> : adaptation?.status === 'ready' ? <Button className="w-full" disabled={busy || flow.isRefreshing || flow.unavailable || (job?.error_code === 'remote_changed' && !replaceRemote) || (['destination_missing', 'partial_created'].includes(job?.error_code ?? '') && !recreateRemote)} onClick={() => void perform(() => flow.send.mutateAsync({ replace_remote: replaceRemote, recreate_remote: recreateRemote }), 'L’envoi n’a pas pu être confirmé')}>
            {busy ? 'Envoi en cours…' : flow.hasDestination && !recreateRemote ? 'Mettre à jour sur Cookidoo' : 'Envoyer cette version'}
          </Button> : adaptation?.status !== 'needs_input' && <Button className="w-full" disabled={busy || flow.unavailable} onClick={() => void perform(() => flow.prepare.mutateAsync({}), 'Adaptation impossible pour le moment')}>
            {busy ? 'Adaptation pour votre TM7…' : adaptation?.status === 'failed' ? 'Réessayer l’adaptation' : 'Préparer la version Cookidoo'}
          </Button>}
          {adaptation?.status === 'ready' && <Button variant="ghost" disabled={busy} onClick={() => void flow.refresh()}>Actualiser l’aperçu</Button>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
