SITE PLANNING & FAQ NUMÉRIQUE - DERNIÈRE VERSION

Identifiants :
- admin / Admin2026!
- collegue1 / Collegue1!
- collegue2 / Collegue2!
- collegue3 / Collegue3!

Fonctions principales :
- Login obligatoire avec effet rideau Windows 11.
- Logs séparés dans data/users.js.
- Planning semaine avec dates réelles.
- Boutons semaine précédente / semaine suivante.
- Seul l'admin peut ajouter, modifier ou supprimer les créneaux du planning.
- Les créneaux de plus d'une heure sont fusionnés en un seul bloc.
- L'admin crée les créneaux "FAQ Numérique".
- Les collègues peuvent remplir uniquement les créneaux FAQ créés par l'admin.
- Onglet Structures & couleurs visible uniquement par l'admin.
- Ajout et suppression de structures avec couleur.
- Boutons Modifier / Supprimer dans le planning.
- Boutons Modifier / Supprimer dans "Créneaux FAQ autorisés par l'admin".
- Boutons Modifier / Supprimer sur les rendez-vous FAQ selon les droits.
- Export CSV des rendez-vous FAQ.

ENVOI AUTOMATIQUE DU MAIL :
Le site GitHub Pages seul ne peut pas envoyer un mail automatiquement.
Pour que cela fonctionne vraiment, il faut Google Apps Script.

Étapes :
1. Va sur https://script.google.com
2. Crée un nouveau projet.
3. Copie le contenu du fichier google-apps-script-mail.gs.
4. Remplace ADMIN_EMAIL par ton adresse mail.
5. Déploie en Application Web.
6. Exécuter en tant que : Moi.
7. Qui a accès : Tout le monde.
8. Copie l'URL qui finit par /exec.
9. Colle cette URL dans data/config.js à googleScriptUrl.
10. Remplace aussi adminEmail dans data/config.js par ton adresse mail.

Quand une collègue ajoutera un RDV FAQ, le mail partira vers ton adresse sans qu'elle ait besoin de son adresse mail.


MISE À JOUR - Notifications mail sur toutes les actions :
- Un mail part quand un RDV FAQ est ajouté.
- Un mail part quand un RDV FAQ est modifié.
- Un mail part quand un RDV FAQ est supprimé.
- Un mail part quand l'admin modifie un créneau FAQ autorisé dans le planning.
- Un mail part quand l'admin supprime un créneau FAQ autorisé dans le planning.
- Le fichier Google Apps Script a été mis à jour : il faut remplacer l'ancien code Apps Script par le nouveau contenu de google-apps-script-mail.gs, puis redéployer.


CORRECTION :
- Les boutons Modifier / Supprimer restent visibles et cliquables même sur les créneaux d'une heure.
- Aucun changement Google Apps Script nécessaire si tu avais déjà mis la version qui envoie les mails pour ajout, modification et suppression.


CORRECTION NOTIFICATIONS ADMIN + COLLÈGUES :
- Les collègues déclenchent maintenant un mail quand ils modifient un RDV FAQ.
- Les collègues déclenchent maintenant un mail quand ils suppriment un RDV FAQ.
- L'admin déclenche toujours un mail quand il modifie/supprime un RDV FAQ.
- L'admin déclenche un mail quand il modifie/supprime un créneau planning ou FAQ autorisé.
- Le fichier google-apps-script-mail.gs est renforcé : remplace le code Apps Script par ce nouveau code, puis déploie une nouvelle version.


MISE À JOUR - Chevauchement RDV FAQ + affichage planning :
- Impossible de créer deux RDV FAQ qui se chevauchent sur la même date et la même structure.
- Exemple bloqué : 09:00-09:30 puis 09:00-09:15.
- Exemple autorisé : 10:00-11:00 puis 11:00-12:00.
- Les RDV FAQ apparaissent maintenant directement superposés sur le créneau FAQ dans le planning.
- Le texte des ateliers/créneaux est rendu visible autant que possible, même dans les créneaux courts.


MISE À JOUR - Pop-up détails planning :
- Sur le planning, les blocs sont plus courts et plus propres.
- Quand on clique sur un atelier/créneau, un pop-up affiche toutes les informations.
- Les boutons Modifier/Supprimer sont maintenant dans le pop-up si l'utilisateur a les droits.
- Les RDV FAQ superposés sont aussi cliquables et affichent leurs informations dans un pop-up.


CORRECTION PLANNING CLAIR ET SPACIEUX :
- Les cartes respectent mieux les horaires réels.
- Le planning est plus haut : 1 heure = 120px.
- Deux RDV qui se suivent, par exemple 10:00-11:00 puis 11:00-12:00, ne se chevauchent plus visuellement.
- Les cartes courtes restent compactes ; le détail complet est accessible au clic via le pop-up.


MISE À JOUR - Planning encadré + ligne heure actuelle + calendrier :
- Le planning est maintenant dans un grand encadré.
- Chaque jour est délimité par un contour.
- Des lignes fines séparent chaque heure.
- Une ligne bleue indique l'heure actuelle sur le jour en cours.
- Le Google Apps Script joint maintenant un fichier calendrier .ics au mail quand une action contient une date et des horaires.
- Ce fichier .ics peut être ouvert dans Outlook pour ajouter l'événement.
- Pour un ajout 100 % automatique et silencieux dans Outlook, il faut Microsoft Graph ou Power Automate.


MISE À JOUR POWER AUTOMATE :
Le Google Apps Script ajoute maintenant des lignes faciles à lire par Power Automate :

PA_TITLE=
PA_DATE=
PA_START=
PA_END=
PA_STRUCTURE=
PA_ACTION=

Il faut remplacer le code Google Apps Script actuel par le contenu du fichier google-apps-script-mail.gs, remettre ton adresse mail dans ADMIN_EMAIL, puis redéployer une nouvelle version.


CORRECTION MAIL ATELIER :
- Un mail est maintenant envoyé quand l'admin crée un atelier dans le planning.
- Un mail est aussi envoyé quand l'admin crée un créneau FAQ autorisé dans le planning.
- Pas besoin de modifier Google Apps Script si tu as déjà la version avec PA_TITLE / PA_DATE / PA_START / PA_END / PA_STRUCTURE.


CORRECTION CONFIG / CACHE :
- index.html charge maintenant data/config.js avec un paramètre ?v=20260427 pour éviter le cache GitHub/Chrome.
- Le site ne bloque plus l'envoi si adminEmail semble non configuré côté navigateur.
- L'envoi réel reste géré par Google Apps Script, donc l'adresse importante est aussi celle dans const ADMIN_EMAIL.



MISE À JOUR - ACTIVITÉS DE LA SEMAINE (24/08/2026) :
- Nouvelle rubrique publique « Activités de la semaine » accessible sans compte.
- Les activités du jour sont affichées en premier.
- Les activités à venir suivent, de la plus proche à la plus lointaine.
- Les activités passées sont affichées ensuite, de la plus récente à la plus ancienne.
- Filtre public par site / structure.
- Les cadres reprennent automatiquement les couleurs des structures du site.
- L'administrateur dispose d'un nouvel onglet « Activités » pour ajouter, modifier et supprimer les flyers.
- Formats de flyer : JPG, PNG, WebP ou PDF, jusqu'à 8 Mo.

STOCKAGE DES FLYERS :
Le planning / FAQ existant n'est pas modifié. Les flyers utilisent un Google Apps Script séparé pour éviter de casser la synchronisation actuelle.

1. Va sur https://script.google.com
2. Crée un NOUVEAU projet.
3. Copie le contenu de google-apps-script-activities.gs dans Code.gs.
4. Déploie > Nouveau déploiement > Application Web.
5. Exécuter en tant que : Moi.
6. Qui a accès : Tout le monde.
7. Copie l'URL qui finit par /exec.
8. Colle-la dans data/config.js à activitiesScriptUrl.
9. Remets ensuite les fichiers du site sur GitHub Pages.

Le premier flyer crée automatiquement un dossier Google Drive « RDVs - Flyers ».
Sans cette URL, la rubrique fonctionne en démonstration locale, mais les flyers ajoutés ne seront visibles que sur l'appareil de l'administrateur.
