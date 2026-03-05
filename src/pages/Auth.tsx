import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, ChefHat } from 'lucide-react';
import { lovable } from '@/integrations/lovable/index';
import { Separator } from '@/components/ui/separator';

const emailSchema = z.string().email('Email invalide');
const passwordSchema = z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères');

export default function Auth() {
  const { user, loading, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupDisplayName, setSignupDisplayName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result?.error) {
      toast.error('Erreur de connexion Google', {
        description: result.error.message || 'Une erreur est survenue',
      });
    }
    setGoogleLoading(false);
  };

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      navigate('/home');
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error('Erreur de validation', {
          description: err.errors[0].message,
        });
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsSubmitting(false);

    if (error) {
      let message = 'Erreur de connexion';
      const errorMsg = error.message.toLowerCase();
      
      if (errorMsg.includes('invalid login credentials') || errorMsg.includes('invalid_credentials')) {
        message = 'Email ou mot de passe incorrect';
      } else if (errorMsg.includes('email not confirmed')) {
        message = 'Veuillez confirmer votre email avant de vous connecter';
      } else if (errorMsg.includes('too many requests') || errorMsg.includes('rate limit')) {
        message = 'Trop de tentatives. Veuillez réessayer dans quelques minutes';
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        message = 'Erreur de connexion réseau. Vérifiez votre connexion internet';
      } else if (errorMsg.includes('user not found')) {
        message = 'Aucun compte trouvé avec cet email';
      }
      
      toast.error('Erreur de connexion', {
        description: message,
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(resetEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error('Erreur de validation', {
          description: err.errors[0].message,
        });
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await resetPassword(resetEmail);
    setIsSubmitting(false);

    if (error) {
      let message = 'Erreur lors de la réinitialisation';
      const errorMsg = error.message.toLowerCase();
      
      if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
        message = 'Trop de demandes. Veuillez réessayer dans quelques minutes';
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        message = 'Erreur de connexion réseau';
      }
      
      toast.error('Erreur', {
        description: message,
      });
    } else {
      toast.success('Email envoyé', {
        description: 'Consultez votre boîte mail pour réinitialiser votre mot de passe',
      });
      setShowResetForm(false);
      setResetEmail('');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error('Erreur de validation', {
          description: err.errors[0].message,
        });
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await signUp(signupEmail, signupPassword, signupDisplayName || undefined);
    setIsSubmitting(false);

    if (error) {
      let message = "Erreur lors de l'inscription";
      const errorMsg = error.message.toLowerCase();
      
      if (errorMsg.includes('already registered') || errorMsg.includes('already exists')) {
        message = 'Un compte existe déjà avec cet email';
      } else if (errorMsg.includes('weak password') || errorMsg.includes('password')) {
        message = 'Le mot de passe est trop faible. Utilisez au moins 6 caractères';
      } else if (errorMsg.includes('invalid email')) {
        message = 'Adresse email invalide';
      } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
        message = 'Trop de tentatives. Veuillez réessayer plus tard';
      } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
        message = 'Erreur de connexion réseau';
      }
      
      toast.error("Erreur d'inscription", {
        description: message,
      });
    } else {
      toast.success('Compte créé', {
        description: 'Vous êtes maintenant connecté',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ChefHat className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Mes Recettes</CardTitle>
          <CardDescription>Connectez-vous pour gérer vos recettes</CardDescription>
        </CardHeader>
        
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mx-6" style={{ width: 'calc(100% - 3rem)' }}>
            <TabsTrigger value="login">Connexion</TabsTrigger>
            <TabsTrigger value="signup">Inscription</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            {showResetForm ? (
              <form onSubmit={handleResetPassword}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Un email vous sera envoyé avec un lien pour réinitialiser votre mot de passe.
                  </p>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Envoyer le lien
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full"
                    onClick={() => setShowResetForm(false)}
                  >
                    Retour à la connexion
                  </Button>
                </CardFooter>
              </form>
            ) : (
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Mot de passe</Label>
                      <Button 
                        type="button"
                        variant="link" 
                        className="px-0 h-auto text-xs text-muted-foreground"
                        onClick={() => setShowResetForm(true)}
                      >
                        Mot de passe oublié ?
                      </Button>
                    </div>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Se connecter
                  </Button>
                </CardFooter>
              </form>
            )}
          </TabsContent>
          
          <TabsContent value="signup">
            <form onSubmit={handleSignup}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nom d'affichage (optionnel)</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Votre nom"
                    value={signupDisplayName}
                    onChange={(e) => setSignupDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="votre@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Mot de passe</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Créer un compte
                </Button>
              </CardFooter>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
