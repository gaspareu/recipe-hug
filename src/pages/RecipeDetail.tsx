import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Users, ListChecks, Sparkles, Loader2, Leaf, MessageCircle, CheckCircle, Circle, RotateCcw, ChefHat, Pencil, Save, History, Plus, Mic, MicOff, ArrowUp, X, ImagePlus } from 'lucide-react';
import { CookingAssistantButton } from '@/components/recipes/CookingAssistantButton';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecipeImageDisplay } from '@/components/recipes/RecipeImageDisplay';
import { RecipeVersionHistory } from '@/components/recipes/RecipeVersionHistory';
import { VoiceControls } from '@/components/voice/VoiceControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { RecipeStatusSelect } from '@/components/recipes/RecipeStatusSelect';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklistWithHeader } from '@/components/recipes/IngredientChecklist';
import { useRecipe, useToggleFavorite, useUpdateRecipe, useCreateRecipe } from '@/hooks/useRecipes';
import { useGenerateRecipeImage } from '@/hooks/useGenerateRecipeImage';
import { useCookingAssistant, ChatMessage, AssistantMode, ExtractedRecipeData } from '@/hooks/useCookingAssistant';
import { useCreateVersion } from '@/hooks/useRecipeVersions';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSwipeClose } from '@/hooks/useSwipeClose';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { RecipeStatus, Step, Ingredient } from '@/types/recipe';
export default function RecipeDetail() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const {
    data: recipe,
    isLoading,
    refetch
  } = useRecipe(id || '');
  const toggleFavorite = useToggleFavorite();
  const updateRecipe = useUpdateRecipe();
  const createRecipe = useCreateRecipe();
  const createVersion = useCreateVersion();
  const generateImage = useGenerateRecipeImage();
  const { user } = useAuth();
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
      toast.success('Image mise à jour', {
        description: 'L\'image de la recette a été modifiée'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Erreur', {
        description: "Impossible de télécharger l'image"
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
      toast.success('Image supprimée', {
        description: 'L\'image de la recette a été retirée'
      });
    } catch (error) {
      console.error('Error removing image:', error);
      toast.error('Erreur', {
        description: "Impossible de supprimer l'image"
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
      toast.success('Analyse terminée', {
        description: 'Le résumé nutritionnel a été généré'
      });
    } catch (error) {
      console.error('Error analyzing recipe:', error);
      toast.error('Erreur', {
        description: "Impossible d'analyser la recette"
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
                    onClick={() => {
                      const ingredients = recipe.ingredients as Array<{ name: string }>;
                      generateImage.mutate(
                        { recipeId: recipe.id, title: recipe.title, ingredients },
                        {
                          onSuccess: () => {
                            toast.success('Image générée !', {
                              description: 'La nouvelle image a été appliquée à la recette.'
                            });
                          },
                          onError: (error) => {
                            toast.error('Erreur', {
                              description: error.message || 'Impossible de générer l\'image'
                            });
                          }
                        }
                      );
                    }} 
                    disabled={generateImage.isPending} 
                    className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80"
                  >
                    {generateImage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Régénérer l'image</p>
                </TooltipContent>
              </Tooltip>
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

        <div className="overflow-x-auto pb-1 -mb-1">
          <div className="flex items-center gap-2 min-w-max py-1">
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
                    onRecipeUpdate={async (data) => {
                      // Save current version before updating
                      if (user) {
                        await createVersion.mutateAsync({
                          recipeId: recipe.id,
                          userId: user.id,
                          title: recipe.title,
                          servings: recipe.servings,
                          ingredients: recipe.ingredients as Ingredient[],
                          steps: recipe.steps as Step[],
                          season: recipe.season,
                          nutrition_tags: recipe.nutrition_tags,
                          changeDescription: 'Avant modification via assistant',
                        });
                      }
                      
                      await updateRecipe.mutateAsync({
                        id: recipe.id,
                        title: data.title,
                        servings: data.servings,
                        ingredients: data.ingredients,
                        steps: data.steps,
                      });
                      toast.success('Recette mise à jour', {
                        description: 'Les modifications ont été appliquées. Vous pouvez restaurer la version précédente depuis l\'historique.'
                      });
                      refetch();
                    }}
                    onRecipeCreate={async (data) => {
                      const newRecipe = await createRecipe.mutateAsync({
                        title: data.title,
                        servings: data.servings,
                        ingredients: data.ingredients,
                        steps: data.steps,
                        status: 'draft',
                        is_favorite: false,
                        source_type: 'ai',
                        ai_summary: data.relationToOriginal ? `Inspiré de "${recipe.title}". ${data.relationToOriginal}` : null,
                        season: null,
                        nutrition_tags: null,
                        calorie_score: null,
                        source_image_url: null,
                      });
                      toast.success('Nouvelle recette créée !', {
                        description: `"${newRecipe.title}" a été ajoutée à votre carnet.`
                      });
                      setChatOpen(false);
                      navigate(`/recipes/${newRecipe.id}`);
                    }}
                    recipeId={recipe.id}
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
  onClose,
  onRecipeUpdate,
  onRecipeCreate,
  recipeId
}: {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  completedSteps: Set<number>;
  totalSteps: number;
  onClose: () => void;
  onRecipeUpdate: (data: ExtractedRecipeData) => Promise<void>;
  onRecipeCreate: (data: ExtractedRecipeData) => Promise<void>;
  recipeId: string;
}) {
  const { style: swipeStyle, ...swipeHandlers } = useSwipeClose({ onClose, direction: 'right', threshold: 80 });
  const [activeMode, setActiveMode] = useState<AssistantMode | 'history'>('cooking');

  return (
    <div className="flex flex-col h-full" style={swipeStyle} {...swipeHandlers}>
      <SheetHeader className="p-4 pb-2 border-b space-y-3">
        <SheetTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>{activeMode === 'cooking' ? '👨‍🍳' : activeMode === 'editing' ? '✏️' : '📜'}</span>
            {activeMode === 'history' ? 'Historique' : 'Assistant'}
          </span>
          {activeMode === 'cooking' && (
            <span className="text-sm font-normal text-muted-foreground px-0 pr-[17px]">
              Étape {Math.min(completedSteps.size + 1, totalSteps)}/{totalSteps}
            </span>
          )}
        </SheetTitle>
        
        {/* Mode toggle */}
        <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as AssistantMode | 'history')} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cooking" className="flex items-center gap-1.5">
              <ChefHat className="h-3.5 w-3.5" />
              <span className="text-xs">Cuisiner</span>
            </TabsTrigger>
            <TabsTrigger value="editing" className="flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs">Modifier</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              <span className="text-xs">Historique</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </SheetHeader>
      
      {activeMode === 'history' ? (
        <RecipeVersionHistory recipeId={recipeId} onRestore={onClose} />
      ) : (
        <ChatInterface 
          recipe={recipe} 
          completedSteps={completedSteps} 
          mode={activeMode}
          onModeChange={setActiveMode}
          onRecipeUpdate={onRecipeUpdate}
          onRecipeCreate={onRecipeCreate}
        />
      )}
    </div>
  );
}

// Chat Interface Component
function ChatInterface({
  recipe,
  completedSteps,
  mode,
  onModeChange,
  onRecipeUpdate,
  onRecipeCreate
}: {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  completedSteps: Set<number>;
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  onRecipeUpdate: (data: ExtractedRecipeData) => Promise<void>;
  onRecipeCreate: (data: ExtractedRecipeData) => Promise<void>;
}) {
  const {
    messages,
    isStreaming,
    sendMessage,
    resetChat,
    mode: hookMode,
    changeMode,
    pendingRecipe,
    clearPendingRecipe
  } = useCookingAssistant(recipe, completedSteps, mode);
  
  const [input, setInput] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageRef = useRef<string>('');

  // Voice mode with callback for transcribed text
  const handleVoiceTranscript = useCallback((text: string) => {
    if (text.trim()) {
      sendMessage(text);
    }
  }, [sendMessage]);

  const {
    voiceEnabled,
    isSpeaking,
    isListening,
    toggleVoice,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    partialTranscript,
  } = useVoiceMode(handleVoiceTranscript);

  // Sync mode changes from parent
  useEffect(() => {
    if (mode !== hookMode) {
      changeMode(mode);
    }
  }, [mode, hookMode, changeMode]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Speak new assistant messages when voice is enabled
  useEffect(() => {
    if (!voiceEnabled) return;
    
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage && 
      lastMessage.role === 'assistant' && 
      lastMessage.content &&
      !isStreaming &&
      lastMessage.content !== lastMessageRef.current
    ) {
      lastMessageRef.current = lastMessage.content;
      speak(lastMessage.content);
    }
  }, [messages, isStreaming, voiceEnabled, speak]);

  const handleSubmit = () => {
    if (input.trim() && !isStreaming) {
      sendMessage(input);
      setInput('');
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleApplyChanges = async () => {
    if (!pendingRecipe) return;
    
    setIsApplying(true);
    try {
      if (pendingRecipe.isNewRecipe) {
        await onRecipeCreate(pendingRecipe);
      } else {
        await onRecipeUpdate(pendingRecipe);
      }
      clearPendingRecipe();
    } finally {
      setIsApplying(false);
    }
  };

  const cookingSuggestions = ["C'est parti !", "Explique-moi la première étape", "Des conseils pour cette recette ?"];
  const editingSuggestions = ["Version végétarienne", "Réduire les calories", "Sans gluten", "Plus simple"];
  
  const quickSuggestions = mode === 'cooking' ? cookingSuggestions : editingSuggestions;
  const showSuggestions = messages.length <= 1;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-4 space-y-6">
          {messages.map(message => <MessageBubble key={message.id} message={message} />)}
          
          {isStreaming && messages[messages.length - 1]?.content === '' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Partial transcript while listening */}
          {isListening && partialTranscript && (
            <div className="flex justify-end">
              <div className="bg-muted/50 rounded-3xl px-4 py-3 max-w-[85%]">
                <p className="text-sm italic text-muted-foreground">{partialTranscript}...</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Apply changes button when pending recipe exists */}
      {pendingRecipe && (
        <div className="flex flex-col gap-3 p-3 mx-4 bg-primary/5 border border-primary/20 rounded-2xl">
          <p className="text-sm text-foreground text-center break-words">
            {pendingRecipe.isNewRecipe ? `Créer "${pendingRecipe.title}" ?` : `Mettre à jour "${pendingRecipe.title}" ?`}
          </p>
          <div className="flex justify-end items-center gap-2">
            <Button size="sm" onClick={handleApplyChanges} disabled={isApplying} className="gap-1">
              {isApplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : pendingRecipe.isNewRecipe ? (
                <Plus className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {pendingRecipe.isNewRecipe ? 'Créer' : 'Mettre à jour'}
            </Button>
            <Button size="icon" variant="ghost" onClick={clearPendingRecipe} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bottom area */}
      <div className="p-4 space-y-4">
        {/* Voice controls */}
        <VoiceControls
          voiceEnabled={voiceEnabled}
          isSpeaking={isSpeaking}
          isListening={isListening}
          onToggleVoice={toggleVoice}
          onStartListening={startListening}
          onStopListening={stopListening}
          onStopSpeaking={stopSpeaking}
          partialTranscript={partialTranscript}
          compact
        />

        {/* Quick suggestions */}
        {showSuggestions && (
          <div className="flex flex-wrap gap-2 justify-center">
            {quickSuggestions.map(suggestion => (
              <Button 
                key={suggestion} 
                variant="outline" 
                size="sm" 
                onClick={() => sendMessage(suggestion)} 
                disabled={isStreaming}
                className="text-sm rounded-2xl px-4 py-2 h-auto whitespace-normal text-center border-border/50 hover:bg-muted"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        {/* Input container - ChatGPT style like Home page */}
        <div className="relative bg-muted rounded-[24px] border border-border/50 px-3 py-3">
          {/* Main input row with flex alignment */}
          <div className="flex items-end gap-2">
            {/* Reset button */}
            <button 
              onClick={resetChat} 
              disabled={isStreaming || messages.length <= 1}
              className="flex-shrink-0 h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Nouvelle conversation"
            >
              <RotateCcw className="h-4 w-4 text-foreground" />
            </button>
            
            {/* Textarea - expands vertically */}
            <div className="flex-1 flex items-center min-h-[36px]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-resize textarea
                  const target = e.target;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Parlez..." : (mode === 'cooking' ? "Posez une question..." : "Décrivez vos modifications...")}
                className="w-full min-h-[24px] max-h-[200px] resize-none bg-transparent border-0 focus:outline-none focus:ring-0 py-0 px-0 text-base leading-9 placeholder:text-muted-foreground self-center text-foreground"
                rows={1}
                disabled={isStreaming || isListening}
              />
            </div>
            
            {/* Right side buttons */}
            <div className="flex items-center gap-1">
              {/* Microphone button - visible when input is empty */}
              {!input.trim() && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors ${
                    isListening 
                      ? 'bg-destructive text-destructive-foreground' 
                      : 'hover:bg-accent'
                  }`}
                  title={isListening ? 'Arrêter' : 'Écouter'}
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-foreground" />}
                </button>
              )}
              
              {/* Send button - visible when there's input */}
              {input.trim() && (
                <button
                  onClick={handleSubmit}
                  disabled={isStreaming}
                  className="flex-shrink-0 h-9 w-9 bg-foreground text-background rounded-full flex items-center justify-center hover:bg-foreground/90 transition-colors disabled:opacity-50"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message
}: {
  message: ChatMessage;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'bg-muted rounded-3xl px-4 py-3' : ''}`}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap text-foreground">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-li:text-foreground">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}