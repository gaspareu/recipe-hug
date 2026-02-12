import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Users, ListChecks, Sparkles, Loader2, Leaf, MessageCircle, CheckCircle, Circle, RotateCcw, ChefHat, Pencil, Save, History, Plus, Mic, MicOff, ArrowUp, X, ImagePlus, Camera, FileText, Image, ChevronRight, Check } from 'lucide-react';
import { CookingAssistantButton } from '@/components/recipes/CookingAssistantButton';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecipeImageDisplay } from '@/components/recipes/RecipeImageDisplay';
import { RecipeGanttChart } from '@/components/recipes/RecipeGanttChart';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { RecipeStatusSelect } from '@/components/recipes/RecipeStatusSelect';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklistWithHeader } from '@/components/recipes/IngredientChecklist';
import { useRecipe, useToggleFavorite, useUpdateRecipe, useCreateRecipe } from '@/hooks/useRecipes';
import { useGenerateRecipeImage } from '@/hooks/useGenerateRecipeImage';
import { useRecipeChat } from '@/hooks/useRecipeChat';
import { useCreateVersion } from '@/hooks/useRecipeVersions';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSwipeClose } from '@/hooks/useSwipeClose';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { RecipeStatus, Step, Ingredient, TimelineData } from '@/types/recipe';
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
                        description: 'Les modifications ont été appliquées.'
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

        {/* Gantt Chart */}
        {steps.length > 0 && (
          <RecipeGanttChart 
            recipeId={recipe.id} 
            steps={steps} 
            timelineData={(recipe as any).timeline_data as TimelineData | null}
            onTimelineUpdate={refetch}
          />
        )}

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
  onRecipeUpdate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[] }) => Promise<void>;
  onRecipeCreate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[]; relationToOriginal?: string }) => Promise<void>;
  recipeId: string;
}) {
  const { style: swipeStyle, ...swipeHandlers } = useSwipeClose({ onClose, direction: 'right', threshold: 80 });
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');

  return (
    <div className="flex flex-col h-full" style={swipeStyle} {...swipeHandlers}>
      <SheetHeader className="p-4 pb-2 border-b space-y-3">
        <SheetTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            👨‍🍳 Assistant
          </span>
          {activeTab === 'chat' && (
            <span className="text-sm font-normal text-muted-foreground px-0 pr-[17px]">
              Étape {Math.min(completedSteps.size + 1, totalSteps)}/{totalSteps}
            </span>
          )}
        </SheetTitle>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'history')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat" className="flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="text-xs">Chat</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              <span className="text-xs">Historique</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </SheetHeader>
      
      {activeTab === 'history' ? (
        <RecipeVersionHistory recipeId={recipeId} onRestore={onClose} />
      ) : (
        <RecipeChatInterface 
          recipe={recipe} 
          completedSteps={completedSteps} 
          onRecipeUpdate={onRecipeUpdate}
          onRecipeCreate={onRecipeCreate}
        />
      )}
    </div>
  );
}

// Unified Chat Interface Component using useRecipeChat
function RecipeChatInterface({
  recipe,
  completedSteps,
  onRecipeUpdate,
  onRecipeCreate
}: {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  completedSteps: Set<number>;
  onRecipeUpdate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[] }) => Promise<void>;
  onRecipeCreate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[]; relationToOriginal?: string }) => Promise<void>;
}) {
  const {
    messages,
    isStreaming,
    mode,
    pendingRecipe,
    sendMessage,
    resetChat,
    savePendingRecipe,
    cancelPendingRecipe,
    getModeInfo,
  } = useRecipeChat({
    recipe,
    completedSteps,
    onRecipeUpdate: async (data) => {
      await onRecipeUpdate(data);
    },
    onRecipeCreate: async (data) => {
      await onRecipeCreate(data);
    },
  });

  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageRef = useRef<string>('');

  // Voice mode
  const handleVoiceTranscript = useCallback((text: string) => {
    if (text.trim()) sendMessage(text);
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

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [messages]);

  // Speak new assistant messages
  useEffect(() => {
    if (!voiceEnabled) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content && !isStreaming && lastMessage.content !== lastMessageRef.current) {
      lastMessageRef.current = lastMessage.content;
      speak(lastMessage.content);
    }
  }, [messages, isStreaming, voiceEnabled, speak]);

  const handleSubmit = () => {
    if ((!input.trim() && !selectedImage) || isStreaming) return;
    sendMessage(input, selectedImage || undefined);
    setInput('');
    setSelectedImage(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Seules les images sont acceptées'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image trop volumineuse (max 5 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = event => setSelectedImage(event.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // Dynamic suggestions based on mode
  const getQuickSuggestions = () => {
    switch (mode) {
      case 'creating': return ['Plutôt simple et rapide', 'Une version végétarienne', "C'est parfait, enregistre !"];
      case 'cooking': return ['Étape suivante', 'Je peux substituer un ingrédient ?', "C'est quoi la bonne texture ?"];
      case 'editing': return ['Version végétarienne', 'Moins calorique', 'Enregistre les modifications'];
      case 'memory': return ['Mes allergies', 'Mon équipement', 'Mes préférences'];
      default: return ["C'est parti !", 'Modifie cette recette', 'Des conseils ?'];
    }
  };

  const quickSuggestions = getQuickSuggestions();
  const hasConversation = messages.length > 1;
  const modeInfo = getModeInfo();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Mode badge */}
      {modeInfo && (
        <div className="px-4 pt-2">
          <Badge variant="outline" className={`${modeInfo.color} text-xs font-normal`}>
            <span className="mr-1">{modeInfo.icon}</span>
            {modeInfo.label}
          </Badge>
        </div>
      )}

      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="py-4 space-y-6">
          {messages.map(message => {
            let displayContent = message.content;
            if (message.role === 'assistant' && displayContent) {
              displayContent = displayContent.replace(/\{\s*"action"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[^}]*\}\s*\}/g, '').trim();
            }
            return (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${message.role === 'user' ? 'bg-muted rounded-3xl px-4 py-3' : ''}`}>
                  {message.imageUrl && <img src={message.imageUrl} alt="Image envoyée" className="max-w-full max-h-64 rounded-2xl mb-2 object-cover" />}
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-li:text-foreground">
                      <ReactMarkdown>{displayContent}</ReactMarkdown>
                    </div>
                  ) : message.content && message.content !== '📷 Image envoyée' && (
                    <p className="text-sm whitespace-pre-wrap text-foreground">{message.content}</p>
                  )}
                </div>
              </div>
            );
          })}

          {isStreaming && messages[messages.length - 1]?.content === '' && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {isListening && partialTranscript && (
            <div className="flex justify-end">
              <div className="bg-muted/50 rounded-3xl px-4 py-3 max-w-[85%]">
                <p className="text-sm italic text-muted-foreground">{partialTranscript}...</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Pending recipe action bar */}
      {pendingRecipe && (
        <div className="flex flex-col gap-3 p-3 mx-4 bg-primary/5 border border-primary/20 rounded-2xl">
          <p className="text-sm text-foreground text-center break-words">
            {pendingRecipe.isUpdate ? `Mettre à jour "${pendingRecipe.title}" ?` : `Enregistrer "${pendingRecipe.title}" ?`}
          </p>
          <div className="flex justify-end items-center gap-2">
            <Button size="sm" onClick={savePendingRecipe} className="gap-1">
              <Check className="h-4 w-4" />
              {pendingRecipe.isUpdate ? 'Mettre à jour' : 'Créer'}
            </Button>
            <Button size="icon" variant="ghost" onClick={cancelPendingRecipe} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bottom area */}
      <div className="p-4 space-y-4">
        {/* Quick suggestions */}
        {!pendingRecipe && (
          <div className="flex flex-wrap gap-2 justify-center">
            {quickSuggestions.map((suggestion, i) => (
              <Button
                key={i}
                variant={hasConversation ? 'ghost' : 'outline'}
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

        {/* Input container - ChatGPT style */}
        <div className="relative bg-muted rounded-[24px] border border-border/50 px-3 py-3">
          {/* Image preview */}
          {selectedImage && (
            <div className="pb-2">
              <div className="relative inline-block">
                <img src={selectedImage} alt="Aperçu" className="h-20 w-20 object-cover rounded-xl" />
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Add button with popover menu */}
            <TooltipProvider>
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button className="flex-shrink-0 h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors" disabled={isStreaming || isListening}>
                        <Plus className="h-5 w-5 text-foreground" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Ajouter</p></TooltipContent>
                </Tooltip>
                <PopoverContent className="w-56 p-1" align="start" side="top">
                  <div className="flex flex-col">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                      <FileText className="h-4 w-4" /><span>Ajouter des fichiers</span>
                    </button>
                    <button onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute('capture', 'environment');
                        fileInputRef.current.click();
                        fileInputRef.current.removeAttribute('capture');
                      }
                    }} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                      <Camera className="h-4 w-4" /><span>Prendre une photo</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                      <Image className="h-4 w-4" /><span>Ajouter une image</span>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </TooltipProvider>

            {/* Textarea */}
            <div className="flex-1 flex items-center min-h-[36px]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const target = e.target;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Parlez...' : 'Poser une question...'}
                className="w-full min-h-[24px] max-h-[200px] resize-none bg-transparent border-0 focus:outline-none focus:ring-0 py-0 px-0 text-base leading-9 placeholder:text-muted-foreground self-center text-foreground"
                rows={1}
                disabled={isStreaming || isListening}
              />
            </div>

            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />

            {/* Right side buttons */}
            <div className="flex items-center gap-1">
              {!input.trim() && !selectedImage ? (
                <button
                  onClick={() => {
                    if (!voiceEnabled) { toggleVoice(); setTimeout(() => startListening(), 100); }
                    else if (isListening) stopListening();
                    else startListening();
                  }}
                  disabled={isStreaming}
                  className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'}`}
                  title={isListening ? "Arrêter l'écoute" : 'Dicter'}
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isStreaming}
                  className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors bg-foreground text-background hover:bg-foreground/90"
                  title="Envoyer"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="flex items-center justify-center gap-2">
            <button onClick={stopSpeaking} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Chef parle... (cliquez pour arrêter)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}