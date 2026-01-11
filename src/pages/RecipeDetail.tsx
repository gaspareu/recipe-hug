import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Users, ListChecks, Sparkles, Loader2, Leaf, MessageCircle, CheckCircle, Circle, Send, RotateCcw } from 'lucide-react';
import { CookingAssistantButton } from '@/components/recipes/CookingAssistantButton';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecipeImageDisplay } from '@/components/recipes/RecipeImageDisplay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { RecipeStatusSelect } from '@/components/recipes/RecipeStatusSelect';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklistWithHeader } from '@/components/recipes/IngredientChecklist';
import { useRecipe, useToggleFavorite, useUpdateRecipe } from '@/hooks/useRecipes';
import { useCookingAssistant, ChatMessage } from '@/hooks/useCookingAssistant';
import { useSwipeClose } from '@/hooks/useSwipeClose';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { RecipeStatus, Step } from '@/types/recipe';
export default function RecipeDetail() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    data: recipe,
    isLoading,
    refetch
  } = useRecipe(id || '');
  const toggleFavorite = useToggleFavorite();
  const updateRecipe = useUpdateRecipe();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Cooking assistant state
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({
      id: recipe.id,
      is_favorite: !recipe.is_favorite
    });
  };
  const handleStatusChange = (newStatus: RecipeStatus) => {
    if (!recipe) return;
    updateRecipe.mutate({
      id: recipe.id,
      status: newStatus
    });
  };
  const handleImageChange = async (file: File) => {
    if (!recipe) return;
    try {
      // Upload image to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${recipe.id}-${Date.now()}.${fileExt}`;
      const filePath = `recipe-images/${fileName}`;
      const {
        error: uploadError
      } = await supabase.storage.from('recipes').upload(filePath, file, {
        upsert: true
      });
      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('recipes').getPublicUrl(filePath);

      // Update recipe with new image URL
      await updateRecipe.mutateAsync({
        id: recipe.id,
        source_image_url: publicUrl
      });
      toast({
        title: 'Image mise à jour',
        description: 'L\'image de la recette a été modifiée'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Erreur',
        description: "Impossible de télécharger l'image",
        variant: 'destructive'
      });
    }
  };
  const handleImageRemove = async () => {
    if (!recipe) return;
    try {
      await updateRecipe.mutateAsync({
        id: recipe.id,
        source_image_url: null
      });
      toast({
        title: 'Image supprimée',
        description: 'L\'image de la recette a été retirée'
      });
    } catch (error) {
      console.error('Error removing image:', error);
      toast({
        title: 'Erreur',
        description: "Impossible de supprimer l'image",
        variant: 'destructive'
      });
    }
  };
  const handleAnalyze = async () => {
    if (!recipe) return;
    setIsAnalyzing(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('analyze-recipe', {
        body: {
          title: recipe.title,
          ingredients: recipe.ingredients,
          steps: recipe.steps
        }
      });
      if (error) throw error;
      await updateRecipe.mutateAsync({
        id: recipe.id,
        ai_summary: data.ai_summary,
        nutrition_tags: data.nutrition_tags,
        calorie_score: data.calorie_score,
        season: data.season
      });
      toast({
        title: 'Analyse terminée',
        description: 'Le résumé nutritionnel a été généré'
      });
    } catch (error) {
      console.error('Error analyzing recipe:', error);
      toast({
        title: 'Erreur',
        description: "Impossible d'analyser la recette",
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  const handleStepToggle = (stepOrder: number) => {
    setCompletedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepOrder)) {
        newSet.delete(stepOrder);
      } else {
        newSet.add(stepOrder);
      }
      return newSet;
    });
  };
  const handleAdvanceStep = () => {
    if (!recipe) return;
    const steps = recipe.steps as Step[];
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

    // Find next uncompleted step
    for (let i = 0; i < sortedSteps.length; i++) {
      if (!completedSteps.has(sortedSteps[i].order)) {
        setCompletedSteps(prev => new Set([...prev, sortedSteps[i].order]));
        setCurrentStepIndex(i + 1);
        return;
      }
    }
  };
  if (isLoading) {
    return <MainLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </MainLayout>;
  }
  if (!recipe) {
    return <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Recette introuvable</p>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Retour au dashboard</Link>
          </Button>
        </div>
      </MainLayout>;
  }
  const steps = (recipe.steps || []) as Step[];
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
  const totalSteps = steps.length;
  const isComplete = completedSteps.size === totalSteps && totalSteps > 0;
  return <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Recipe Image with action buttons overlay */}
        <div className="relative">
          <RecipeImageDisplay recipeId={recipe.id} imageUrl={recipe.source_image_url} title={recipe.title} onImageChange={handleImageChange} onImageRemove={handleImageRemove} />
          
          {/* Dark gradient at top for button readability */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none rounded-t-lg" />
          
          {/* Back button - top left */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)} 
            className="absolute top-3 left-3 bg-background/60 backdrop-blur-sm hover:bg-background/80"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          {/* Action buttons - top right */}
          <div className="absolute top-3 right-3 flex items-center gap-1">
            <TooltipProvider>
              <FavoriteToggle 
                isFavorite={recipe.is_favorite} 
                onToggle={handleToggleFavorite} 
                disabled={toggleFavorite.isPending} 
                tooltipText={recipe.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} 
                variant="overlay"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleAnalyze} 
                    disabled={isAnalyzing} 
                    className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80"
                  >
                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Analyser</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <Button variant="outline" size="sm" asChild className="bg-background/60 backdrop-blur-sm hover:bg-background/80 border-background/20">
              <Link to={`/recipes/${recipe.id}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Éditer
              </Link>
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <RecipeStatusSelect status={recipe.status} onStatusChange={handleStatusChange} disabled={updateRecipe.isPending} />
            
            {recipe.season && <>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="outline" className="flex items-center gap-1 shrink-0">
                  <Leaf className="h-3 w-3" />
                  {recipe.season}
                </Badge>
              </>}
            
            {recipe.nutrition_tags && recipe.nutrition_tags.length > 0 && <>
                <Separator orientation="vertical" className="h-4" />
                {recipe.nutrition_tags.map((tag, index) => <Badge key={index} variant="secondary" className="shrink-0">
                    {tag}
                  </Badge>)}
              </>}
            
            {recipe.calorie_score && <>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="outline" className="shrink-0">
                  Score: {recipe.calorie_score}/5
                </Badge>
              </>}
          </div>
        </div>

        {recipe.ai_summary && <p className="text-sm text-muted-foreground">{recipe.ai_summary}</p>}

        {recipe.ingredients.length === 0 ? <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                Ingrédients
                {recipe.servings && <span className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {recipe.servings} portions
                  </span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Aucun ingrédient</p>
            </CardContent>
          </Card> : <Card>
            <IngredientChecklistWithHeader ingredients={recipe.ingredients} renderHeader={toggleButton => <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ListChecks className="h-5 w-5" />
                      Ingrédients
                      {recipe.servings && <span className="text-sm font-normal text-muted-foreground flex items-center gap-1 ml-1">
                          <Users className="h-3.5 w-3.5" />
                          {recipe.servings} portions
                        </span>}
                    </span>
                    {toggleButton}
                  </CardTitle>
                </CardHeader>} />
          </Card>}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Étapes</span>
              <Sheet open={chatOpen} onOpenChange={setChatOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" title="Assistant culinaire">
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:w-[400px] md:w-[540px] max-w-full flex flex-col p-0">
                  <AssistantSheetContent 
                    recipe={recipe} 
                    completedSteps={completedSteps} 
                    totalSteps={totalSteps}
                    onClose={() => setChatOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? <p className="text-muted-foreground text-sm">Aucune étape</p> : <ol className="space-y-3">
                {sortedSteps.map((step, index) => {
              const isDone = completedSteps.has(step.order);
              const isCurrent = index === currentStepIndex && !isDone;
              return <li key={step.order}>
                      <button onClick={() => handleStepToggle(step.order)} className={`w-full text-left flex gap-3 p-3 rounded-lg border transition-colors hover:bg-accent/50 ${isCurrent ? 'border-primary bg-primary/5' : isDone ? 'border-muted bg-muted/30' : 'border-border'}`}>
                        <span className="flex-shrink-0 mt-0.5">
                          {isDone ? <CheckCircle className="h-5 w-5 text-primary" /> : <Circle className={`h-5 w-5 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />}
                        </span>
                        <span className={`text-sm leading-relaxed ${isDone ? 'text-muted-foreground line-through' : ''}`}>
                          {step.text}
                        </span>
                      </button>
                    </li>;
            })}
              </ol>}
          </CardContent>
        </Card>

        {totalSteps > 0 && <CookingAssistantButton currentStep={completedSteps.size} totalSteps={totalSteps} onPress={() => setChatOpen(!chatOpen)} isComplete={isComplete} />}
      </div>
    </MainLayout>;
}

// Assistant Sheet Content with swipe support
function AssistantSheetContent({
  recipe,
  completedSteps,
  totalSteps,
  onClose
}: {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  completedSteps: Set<number>;
  totalSteps: number;
  onClose: () => void;
}) {
  const { style: swipeStyle, ...swipeHandlers } = useSwipeClose({ onClose, direction: 'right', threshold: 80 });

  return (
    <div className="flex flex-col h-full" style={swipeStyle} {...swipeHandlers}>
      <SheetHeader className="p-4 pb-2 border-b">
        <SheetTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>👨‍🍳</span>
            Assistant
          </span>
          <span className="text-sm font-normal text-muted-foreground px-0 pr-[17px]">
            Étape {Math.min(completedSteps.size + 1, totalSteps)}/{totalSteps}
          </span>
        </SheetTitle>
      </SheetHeader>
      <ChatInterface recipe={recipe} completedSteps={completedSteps} />
    </div>
  );
}

// Chat Interface Component
function ChatInterface({
  recipe,
  completedSteps
}: {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  completedSteps: Set<number>;
}) {
  const {
    messages,
    isStreaming,
    sendMessage,
    resetChat
  } = useCookingAssistant(recipe, completedSteps);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      sendMessage(input);
      setInput('');
    }
  };
  const quickSuggestions = ["C'est parti !", "Explique-moi la première étape", "Des conseils pour cette recette ?"];
  const showSuggestions = messages.length <= 1;
  return <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map(message => <MessageBubble key={message.id} message={message} />)}
          {isStreaming && <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>}
        </div>
      </ScrollArea>

      <div className="p-4 border-t space-y-3">
        {showSuggestions && <div className="flex flex-wrap gap-2">
            {quickSuggestions.map(suggestion => <Button key={suggestion} variant="outline" size="sm" onClick={() => sendMessage(suggestion)} disabled={isStreaming} className="text-xs">
                {suggestion}
              </Button>)}
          </div>}
        
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Posez une question..." disabled={isStreaming} className="flex-1" />
          <Button type="submit" size="icon" disabled={isStreaming || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={resetChat} title="Réinitialiser">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>;
}
function MessageBubble({
  message
}: {
  message: ChatMessage;
}) {
  const isUser = message.role === 'user';
  return <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {isUser ? <p className="text-sm whitespace-pre-wrap">{message.content}</p> : <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&>p]:m-0 [&>ul]:my-1 [&>ol]:my-1">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>}
      </div>
    </div>;
}