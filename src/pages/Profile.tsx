import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Camera } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { CulinaryPreferencesEditor } from '@/components/profile/CulinaryPreferencesEditor';

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setDisplayName(data.display_name || '');
        setAvatarUrl(data.avatar_url);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Erreur', {
        description: 'Impossible de charger le profil',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Erreur', {
        description: 'Veuillez sélectionner une image',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Erreur', {
        description: "L'image ne doit pas dépasser 2 Mo",
      });
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Add cache buster to force refresh
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(urlWithCacheBuster);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('Succès', {
        description: 'Avatar mis à jour !',
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Erreur', {
        description: "Impossible de mettre à jour l'avatar",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Succès', {
        description: 'Profil mis à jour !',
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Erreur', {
        description: 'Impossible de mettre à jour le profil',
      });
    } finally {
      setIsSaving(false);
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
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Mon Profil</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
            <CardDescription>
              Personnalisez votre profil
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Avatar className="h-24 w-24">
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
          </CardContent>
        </Card>

        {/* Culinary Preferences */}
        <CulinaryPreferencesEditor />
      </div>
    </MainLayout>
  );
}