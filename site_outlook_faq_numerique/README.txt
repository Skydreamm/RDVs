SITE PLANNING OUTLOOK & FAQ NUMÉRIQUE

Changement demandé :
- L'ancien planning semaine du site a été retiré.
- À la place, l'accueil affiche ton planning Outlook via un lien publié.
- Les autres fonctions restent disponibles : connexion, créneaux FAQ autorisés, remplissage RDV, structures/couleurs, mails automatiques, Power Automate.

À configurer dans data/config.js :
- adminEmail
- googleScriptUrl
- outlookCalendarUrl

Pour afficher Outlook :
1. Depuis Outlook Web, publie ton calendrier.
2. Copie le lien HTML.
3. Colle-le dans data/config.js à outlookCalendarUrl.

Pour les mails automatiques :
1. Copie google-apps-script-mail.gs dans Google Apps Script.
2. Remplace ADMIN_EMAIL.
3. Déploie en Application Web.
4. Colle l'URL /exec dans data/config.js à googleScriptUrl.

Power Automate :
Le mail contient :
PA_TITLE=
PA_DATE=
PA_START=
PA_END=
PA_STRUCTURE=
PA_ACTION=
PA_PERSON=
PA_DEMANDE=
