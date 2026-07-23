import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Camera, User, Sun, ChefHat, Webhook, Cpu, UtensilsCrossed } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { useAuth } from '@/hooks/useAuth';
import { useProfile, useUpdateProfile, useUploadAvatar } from '@/hooks/useProfile';
import { CollapsibleSection } from '@/components/profile/CollapsibleSection';
import { CulinaryPreferencesContent } from '@/components/profile/CulinaryPreferencesContent';
import { WebhookIntegrationContent } from '@/components/profile/WebhookIntegrationContent';
import { ThemeSelectorContent } from '@/components/profile/ThemeSelectorContent';
import { AIProviderSettingsContent } from '@/components/profile/AIProviderSettingsContent';
import { CookidooSettingsContent } from '@/components/profile/CookidooSettingsContent';
import { formatAppVersion } from '@/lib/version';

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useProfile(user?.id);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const [displayName, setDisplayName] = useState('');
  // Override d'affichage après upload (URL avec cache-buster pour forcer le
  // rafraîchissement) ; sinon on suit la valeur du profil chargé.
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);

  // Alimente le champ éditable dès que le profil (chargé de façon asynchrone) est
  // disponible. Sync ponctuelle données serveur → état de formulaire éditable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed d'un champ éditable depuis une donnée async, pas un état dérivé calculable au rendu.
    if (profile) setDisplayName(profile.display_name || '');
  }, [profile]);

  const avatarUrl = avatarOverride ?? profile?.avatar_url ?? null;
  const isUploading = uploadAvatar.isPending;
  const isSaving = updateProfile.isPending;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return;
    }

    try {
      const publicUrl = await uploadAvatar.mutateAsync({ userId: user.id, file });
      // Cache buster pour forcer le rechargement de l'image mise à jour.
      setAvatarOverride(`${publicUrl}?t=${Date.now()}`);
    } catch (error) {
      console.error('Error uploading avatar:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await updateProfile.mutateAsync({ userId: user.id, displayName: displayName.trim() || null });
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  const getInitials = () => {
    if (displayName) {
      return displayName.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <MainLayout>
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Mon Profil</h1>
        </div>

        {/* Personal Information */}
        <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-primary"><User className="h-5 w-5" /></span>
            <div>
              <h3 className="font-semibold leading-none tracking-tight">Informations personnelles</h3>
              <p className="text-sm text-muted-foreground mt-1">Personnalisez votre profil</p>
            </div>
          </div>
          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24 transition-transform duration-200 hover:scale-105">
                  <AvatarImage src={avatarUrl || undefined} alt="Avatar" />
                  <AvatarFallback className="text-lg">
                    {isLoading ? '...' : getInitials()}
                  </AvatarFallback>
                </Avatar>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {isUploading ? 'Téléchargement...' : 'Cliquez pour changer votre avatar'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Nom d'affichage</Label>
                <Input
                  id="displayName"
                  placeholder="Votre nom"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isSaving || isLoading}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </form>
          </div>
        </div>

        {/* Theme Selector */}
        <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary"><Sun className="h-5 w-5" /></span>
            <div>
              <h3 className="font-semibold leading-none tracking-tight">Apparence</h3>
              <p className="text-sm text-muted-foreground mt-1">Choisissez le thème de l'application</p>
            </div>
          </div>
          <ThemeSelectorContent />
        </div>

        {/* Culinary Preferences */}
        <CollapsibleSection
          title="Préférences culinaires"
          description="Personnalisez les suggestions du Chef"
          icon={<ChefHat className="h-5 w-5" />}
        >
          <CulinaryPreferencesContent />
        </CollapsibleSection>

        {/* AI Provider Settings */}
        <CollapsibleSection
          title="Configuration IA"
          description="Utilisez vos propres clés API"
          icon={<Cpu className="h-5 w-5" />}
        >
          <AIProviderSettingsContent />
        </CollapsibleSection>

        {/* Cookidoo / Thermomix */}
        <CollapsibleSection
          title="Cookidoo / Thermomix"
          description="Envoyez vos recettes vers votre Thermomix"
          icon={<UtensilsCrossed className="h-5 w-5" />}
        >
          <CookidooSettingsContent />
        </CollapsibleSection>

        {/* Webhook Integration */}
        <CollapsibleSection
          title="Intégrations"
          description="Créez des recettes via webhook"
          icon={<Webhook className="h-5 w-5" />}
        >
          <WebhookIntegrationContent />
        </CollapsibleSection>

        {/* Version de l'application (build déployé) */}
        <p
          className="text-center text-xs text-muted-foreground pb-4"
          data-testid="app-version"
        >
          {formatAppVersion()}
        </p>
      </div>
    </MainLayout>
  );
}
