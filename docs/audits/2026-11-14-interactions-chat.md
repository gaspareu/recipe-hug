# Grimoire — interactions dans les chats

Revue de l’assistant d’accueil et de l’assistant partagé par les fiches et le mode cuisine.

| Friction observée | Correction |
| --- | --- |
| Une réponse peut arriver pendant qu’on relit un ancien échange. Il fallait redescendre manuellement pour rejoindre le nouveau contenu. | Le fil respecte la position de lecture et propose « Revenir au dernier message ». Un nouvel envoi ramène au dernier échange. |
| L’arrivée d’une image, l’agrandissement du composeur ou le redimensionnement de la zone du fil peuvent repousser la réponse hors de l’écran. | Le fil suit ces changements de taille tant que la personne est restée près du dernier message. |
| Arrêter avant le premier fragment pouvait laisser une demande sans retour visible. Les erreurs étaient affichées comme des réponses ordinaires. | L’arrêt volontaire est indiqué dans le fil. Le texte partiel reste visible. Un échec est annoncé comme une erreur. « Réessayer » rejoue la demande précédente, image comprise, et conserve le brouillon en cours. |
| Les commandes de copie, de relance et de retrait d’image étaient petites sur écran tactile. La pièce jointe était désactivée pendant qu’on pouvait déjà rédiger le message suivant. | Les cibles atteignent 44 px. Le prochain message peut recevoir une image pendant une réponse. |

Les vérifications portent sur l’ancrage à la fin du flux, la lecture de l’historique, l’arrêt avant le premier fragment et la relance avec une image. Le clavier natif et la dictée nécessitent un essai sur appareil. L’ouverture et la fermeture de l’assistant de cuisine restent à vérifier sur iPhone avec le clavier visible.
