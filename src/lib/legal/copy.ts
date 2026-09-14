export type LegalLocale = "fr" | "en" | "de" | "it";

export type LegalDoc = {
  lead: string;
  sections: { title: string; paragraphs: string[] }[];
  updated: string;
};

const terms: Record<LegalLocale, LegalDoc> = {
  fr: {
    updated: "14 septembre 2026",
    lead: "Ces conditions régissent l’usage de ticketick.ch, plateforme suisse de billetterie. Elles s’appliquent à l’organisateur (le « Client ») qui met un spectacle en vente et à l’acheteur de billets (l’« Acquéreur »). En utilisant le service ou en commandant un billet, vous les acceptez.",
    sections: [
      {
        title: "1. Champ d’application",
        paragraphs: [
          "ticketick.ch est éditée en Suisse. Elle met à disposition un logiciel de gestion et de vente de billets en ligne, ainsi que l’émission et le suivi des commandes.",
          "La relation de vente du billet n’est pas conclue avec ticketick. Les droits et obligations nés de l’achat — y compris l’entrée à la manifestation — sont établis exclusivement entre l’Acquéreur et le Client. Aucun contrat de spectacle n’est formé entre l’Acquéreur et ticketick.",
          "Pour le spectacle, le billet, un remboursement ou l’accès, l’Acquéreur s’adresse uniquement au Client. ticketick ne traite pas ces demandes.",
        ],
      },
      {
        title: "2. Description du service",
        paragraphs: [
          "Le Client définit de manière autonome ses manifestations : titres, textes, visuels, tarifs, quotas, dates de vente et moyens de paiement ouverts.",
          "Un billet matérialise un droit d’entrée à une manifestation. Il permet à l’Acquéreur de se présenter sur le lieu indiqué pour bénéficier de la prestation offerte par le Client.",
          "ticketick peut afficher les manifestations sur son portail public et, si le Client l’intègre, via un module de commande sur un site tiers.",
        ],
      },
      {
        title: "3. Obligations du Client",
        paragraphs: [
          "Le Client est responsable de toutes les informations qu’il saisit : titre, photos, textes, tarifs, quotas, dates et lieu. Il s’engage à ne pas induire l’Acquéreur en erreur (publicité mensongère, fausses indications).",
          "Le Client garantit que ses manifestations respectent l’ordre public, la santé et les droits des tiers (droit d’auteur, marques, image, licences, diffusion). Il indemnise ticketick de toute prétention d’un tiers liée à ces contenus ou à la manifestation.",
          "Les autorisations administratives (police du feu, communes, etc.) et les frais afférents incombent uniquement au Client.",
        ],
      },
      {
        title: "4. Prix, encaissement et impôts",
        paragraphs: [
          "Le prix de vente du billet est fixé par le Client, en francs suisses (CHF). Des frais de service ou de transaction peuvent s’appliquer selon le moyen de paiement.",
          "Le paiement s’effectue via les prestataires proposés (PostFinance, Stripe, PayPal), selon ce que le Client a ouvert. Les comptes bancaires et d’encaissement sont ceux du Client. Le Client est seul responsable de l’encaissement, de la tenue de ses coordonnées et de tout reversement.",
          "Le Client est seul responsable du décompte fiscal de ses ventes (TVA, impôts, droits d’auteur ou voisins, taxes locales). ticketick n’assume aucune responsabilité en cas de manquement du Client à ces obligations.",
        ],
      },
      {
        title: "5. Commande et émission des billets",
        paragraphs: [
          "La commande de l’Acquéreur n’est ferme qu’après confirmation du paiement. Les places peuvent être retenues quelques minutes pendant le paiement ; au-delà, elles reviennent en vente.",
          "Les billets sont mis à disposition par e-mail, sous forme de document PDF imprimable et/ou de billet mobile muni d’un QR-code. Ils portent un identifiant unique. Une copie, une capture ou un transfert non autorisé peut entraîner un refus à l’entrée.",
        ],
      },
      {
        title: "6. Contrôle des billets et accès",
        paragraphs: [
          "Le Client est seul responsable du contrôle des billets et du contrôle d’accès. ticketick n’a aucune obligation à ce titre.",
          "Il est recommandé de scanner et de composter chaque billet sur place afin d’éviter les impressions multiples. ticketick met à disposition une application de contrôle ; son usage et le matériel restent à la charge du Client.",
        ],
      },
      {
        title: "7. Report, modification et annulation",
        paragraphs: [
          "Le Client assume seul la pleine responsabilité d’une annulation, d’un report ou d’une modification substantielle (date, heure, lieu ou programmation). Une telle modification est assimilée à une annulation pour l’application des présentes.",
          "Si des billets ont déjà été vendus, le Client informe sans délai les Acquéreurs et ticketick. C’est au Client qu’il appartient de rembourser, d’offrir un avoir ou une nouvelle date. ticketick peut transmettre une demande, sans se substituer au Client.",
        ],
      },
      {
        title: "8. Responsabilité de ticketick",
        paragraphs: [
          "ticketick n’est pas responsable du nombre de billets vendus, du succès économique de la manifestation, de l’exactitude des informations saisies par le Client, d’un mauvais paramétrage par le Client, ni d’une indisponibilité due au réseau Internet ou à une cause indépendante de ticketick.",
          "Sauf négligence grave, une interruption du service (maintenance, amélioration) n’engage pas la responsabilité de ticketick.",
          "Si la responsabilité de ticketick est engagée, elle est limitée aux dommages directs et au montant des frais de service éventuellement perçus pour la commande concernée.",
        ],
      },
      {
        title: "9. Données personnelles",
        paragraphs: [
          "Pour les données communiquées par l’Acquéreur lors de l’achat (identité, e-mail, commande), le Client est responsable de traitement. ticketick agit comme sous-traitant pour l’émission des billets, le suivi de commande et le contrôle d’accès.",
          "Les modalités sont précisées dans la page Confidentialité.",
        ],
      },
      {
        title: "10. Modifications et droit applicable",
        paragraphs: [
          "ticketick peut adapter ces conditions pour tenir compte d’une évolution légale, technique ou du service. La version publiée sur ticketick.ch prévaut.",
          "Le droit suisse s’applique. Le for est à Lausanne, sous réserve des fors impératifs prévus par la loi.",
        ],
      },
    ],
  },
  en: {
    updated: "14 September 2026",
    lead: "These terms govern ticketick.ch, a Swiss ticketing platform. They apply to the organiser (the “Client”) who lists an event and to the ticket buyer (the “Purchaser”). By using the service or buying a ticket you accept them.",
    sections: [
      {
        title: "1. Scope",
        paragraphs: [
          "ticketick.ch is operated in Switzerland. It provides software for managing and selling tickets online, issuing tickets and tracking orders.",
          "The ticket sale is not concluded with ticketick. Rights and duties arising from the purchase — including admission — exist only between the Purchaser and the Client. No event contract is formed between the Purchaser and ticketick.",
          "For the event, the ticket, a refund or admission, the Purchaser contacts the Client only. ticketick does not handle those requests.",
        ],
      },
      {
        title: "2. The service",
        paragraphs: [
          "The Client sets its events independently: titles, copy, images, prices, quotas, onsale dates and payment methods.",
          "A ticket embodies a right of admission. It lets the Purchaser attend the venue to receive the Client’s performance.",
          "ticketick may list events on its public site and, if the Client embeds it, through a checkout module on a third-party site.",
        ],
      },
      {
        title: "3. Client obligations",
        paragraphs: [
          "The Client is responsible for all information it enters: title, photos, texts, prices, quotas, dates and venue. It must not mislead the Purchaser (false advertising or false particulars).",
          "The Client warrants that its events respect public order, health and third-party rights (copyright, trade marks, image, licences, broadcasting). It indemnifies ticketick against any third-party claim linked to that content or the event.",
          "Administrative permits (fire service, municipalities, etc.) and related costs fall solely on the Client.",
        ],
      },
      {
        title: "4. Prices, collection and taxes",
        paragraphs: [
          "The ticket price is set by the Client, in Swiss francs (CHF). Service or transaction fees may apply depending on the payment method.",
          "Payment is made through the providers offered (PostFinance, Stripe, PayPal), as enabled by the Client. Bank and collection accounts belong to the Client. The Client alone is responsible for collection, for keeping its details correct and for any remittance.",
          "The Client alone is responsible for the tax settlement of its sales (VAT, taxes, copyright or neighbouring rights, local levies). ticketick is not liable for any failure by the Client to meet those duties.",
        ],
      },
      {
        title: "5. Orders and ticket issuance",
        paragraphs: [
          "The Purchaser’s order is binding only after payment is confirmed. Seats may be held for a few minutes during checkout; after that they go back on sale.",
          "Tickets are delivered by email as a printable PDF and/or a mobile ticket with a QR code. They carry a unique identifier. An unauthorised copy, screenshot or transfer may be refused at the door.",
        ],
      },
      {
        title: "6. Ticket and access control",
        paragraphs: [
          "The Client alone is responsible for checking tickets and controlling access. ticketick has no duty in that regard.",
          "Each ticket should be scanned and marked as used on site to avoid multiple print-outs. ticketick provides a door-control app; its use and any hardware remain the Client’s cost.",
        ],
      },
      {
        title: "7. Postponement, change and cancellation",
        paragraphs: [
          "The Client alone bears full responsibility for a cancellation, postponement or substantial change (date, time, venue or programme). Such a change is treated as a cancellation for these terms.",
          "If tickets have already been sold, the Client informs Purchasers and ticketick without delay. Refunds, vouchers or a new date are the Client’s duty. ticketick may forward a request but does not replace the Client.",
        ],
      },
      {
        title: "8. Liability of ticketick",
        paragraphs: [
          "ticketick is not liable for the number of tickets sold, the economic success of the event, the accuracy of information entered by the Client, a misconfiguration by the Client, or unavailability caused by the Internet or a cause beyond ticketick.",
          "Except in cases of gross negligence, a service interruption (maintenance or improvement) does not engage ticketick’s liability.",
          "If ticketick is liable, liability is limited to direct damage and to any service fee charged on the order concerned.",
        ],
      },
      {
        title: "9. Personal data",
        paragraphs: [
          "For data the Purchaser gives when buying (identity, email, order), the Client is the controller. ticketick acts as processor for issuing tickets, tracking the order and door control.",
          "Details are set out on the Privacy page.",
        ],
      },
      {
        title: "10. Changes and governing law",
        paragraphs: [
          "ticketick may update these terms to reflect legal, technical or service changes. The version published on ticketick.ch prevails.",
          "Swiss law applies. The place of jurisdiction is Lausanne, subject to mandatory venues provided by law.",
        ],
      },
    ],
  },
  de: {
    updated: "14. September 2026",
    lead: "Diese Bedingungen gelten für ticketick.ch, eine Schweizer Ticketing-Plattform. Sie gelten für den Veranstalter (den «Kunden»), der eine Vorstellung anbietet, und für den Ticketkäufer (den «Erwerber»). Mit der Nutzung oder dem Ticketkauf akzeptieren Sie sie.",
    sections: [
      {
        title: "1. Geltungsbereich",
        paragraphs: [
          "ticketick.ch wird in der Schweiz betrieben. Sie stellt eine Software für die Verwaltung und den Online-Verkauf von Tickets sowie für Ausstellung und Bestellverfolgung bereit.",
          "Der Ticketverkauf kommt nicht mit ticketick zustande. Rechte und Pflichten aus dem Kauf — einschliesslich des Einlasses — bestehen ausschliesslich zwischen Erwerber und Kunden. Es entsteht kein Veranstaltungsvertrag zwischen Erwerber und ticketick.",
          "Für Vorstellung, Ticket, Rückerstattung oder Einlass wendet sich der Erwerber nur an den Kunden. ticketick bearbeitet solche Anfragen nicht.",
        ],
      },
      {
        title: "2. Beschreibung des Dienstes",
        paragraphs: [
          "Der Kunde legt seine Vorstellungen selbst fest: Titel, Texte, Bilder, Preise, Kontingente, Verkaufsdaten und Zahlungsmittel.",
          "Ein Ticket verkörpert ein Eintrittsrecht. Es erlaubt dem Erwerber, am angegebenen Ort die Leistung des Kunden in Anspruch zu nehmen.",
          "ticketick kann Vorstellungen auf dem öffentlichen Portal listen und, wenn der Kunde es einbindet, über ein Bestellmodul auf einer Drittseite.",
        ],
      },
      {
        title: "3. Pflichten des Kunden",
        paragraphs: [
          "Der Kunde haftet für alle von ihm erfassten Angaben: Titel, Fotos, Texte, Preise, Kontingente, Daten und Ort. Er darf den Erwerber nicht täuschen (irreführende Werbung, falsche Angaben).",
          "Der Kunde gewährleistet, dass seine Vorstellungen die öffentliche Ordnung, die Gesundheit und Rechte Dritter (Urheber-, Marken-, Bild-, Lizenz- und Senderechte) achten. Er stellt ticketick von Ansprüchen Dritter frei, die mit diesen Inhalten oder der Vorstellung zusammenhängen.",
          "Behördliche Bewilligungen (Feuerpolizei, Gemeinden usw.) und die damit verbundenen Kosten liegen allein beim Kunden.",
        ],
      },
      {
        title: "4. Preise, Inkasso und Steuern",
        paragraphs: [
          "Den Ticketpreis setzt der Kunde in Schweizer Franken (CHF) fest. Service- oder Transaktionsgebühren können je nach Zahlungsmittel anfallen.",
          "Die Zahlung erfolgt über die angebotenen Anbieter (PostFinance, Stripe, PayPal), soweit der Kunde sie geöffnet hat. Bank- und Inkassokonten gehören dem Kunden. Er allein ist für Inkasso, korrekte Angaben und allfällige Weiterleitungen verantwortlich.",
          "Der Kunde allein ist für die steuerliche Abrechnung seiner Verkäufe zuständig (MWST, Steuern, Urheber- oder verwandte Schutzrechte, lokale Abgaben). ticketick haftet nicht für Pflichtverletzungen des Kunden.",
        ],
      },
      {
        title: "5. Bestellung und Ticketausstellung",
        paragraphs: [
          "Die Bestellung des Erwerbers ist erst nach bestätigter Zahlung verbindlich. Plätze können während der Zahlung einige Minuten reserviert bleiben; danach kommen sie wieder in den Verkauf.",
          "Tickets werden per E-Mail als druckbares PDF und/oder mobiles Ticket mit QR-Code zugestellt. Sie tragen eine eindeutige Kennung. Eine unautorisierte Kopie, ein Screenshot oder eine Weitergabe kann am Eingang abgelehnt werden.",
        ],
      },
      {
        title: "6. Ticket- und Zugangskontrolle",
        paragraphs: [
          "Der Kunde ist allein verantwortlich für Ticket- und Zugangskontrolle. ticketick hat insoweit keine Pflicht.",
          "Jedes Ticket sollte vor Ort gescannt und entwertet werden, um Mehrfachausdrucke zu vermeiden. ticketick stellt eine Kontroll-App bereit; Nutzung und Material gehen zulasten des Kunden.",
        ],
      },
      {
        title: "7. Verschiebung, Änderung und Absage",
        paragraphs: [
          "Der Kunde trägt allein die volle Verantwortung für Absage, Verschiebung oder wesentliche Änderung (Datum, Uhrzeit, Ort oder Programm). Eine solche Änderung gilt für diese Bedingungen als Absage.",
          "Sind bereits Tickets verkauft, informiert der Kunde Erwerber und ticketick unverzüglich. Rückerstattung, Gutschein oder Ersatztermin obliegen dem Kunden. ticketick kann eine Anfrage weiterleiten, tritt aber nicht an seine Stelle.",
        ],
      },
      {
        title: "8. Haftung von ticketick",
        paragraphs: [
          "ticketick haftet nicht für die verkaufte Ticketzahl, den wirtschaftlichen Erfolg der Vorstellung, die Richtigkeit der vom Kunden erfassten Angaben, eine Fehlkonfiguration durch den Kunden oder eine Nichtverfügbarkeit wegen des Internets oder einer von ticketick unabhängigen Ursache.",
          "Ausser bei grober Fahrlässigkeit begründet eine Dienstunterbrechung (Wartung, Verbesserung) keine Haftung von ticketick.",
          "Eine allfällige Haftung von ticketick beschränkt sich auf unmittelbare Schäden und auf eine für die betreffende Bestellung erhobene Servicegebühr.",
        ],
      },
      {
        title: "9. Personendaten",
        paragraphs: [
          "Für Daten, die der Erwerber beim Kauf mitteilt (Identität, E-Mail, Bestellung), ist der Kunde Verantwortlicher. ticketick handelt als Auftragsbearbeiterin für Ausstellung, Bestellverfolgung und Einlasskontrolle.",
          "Einzelheiten stehen auf der Datenschutzseite.",
        ],
      },
      {
        title: "10. Änderungen und anwendbares Recht",
        paragraphs: [
          "ticketick kann diese Bedingungen anpassen, um rechtliche, technische oder dienstliche Entwicklungen zu berücksichtigen. Es gilt die auf ticketick.ch veröffentlichte Fassung.",
          "Es gilt schweizerisches Recht. Gerichtsstand ist Lausanne, vorbehaltlich zwingender gesetzlicher Gerichtsstände.",
        ],
      },
    ],
  },
  it: {
    updated: "14 settembre 2026",
    lead: "Queste condizioni regolano ticketick.ch, piattaforma svizzera di biglietteria. Si applicano all’organizzatore (il «Cliente») che mette in vendita uno spettacolo e all’acquirente dei biglietti (l’«Acquirente»). Usando il servizio o acquistando un biglietto le accettate.",
    sections: [
      {
        title: "1. Campo di applicazione",
        paragraphs: [
          "ticketick.ch è gestita in Svizzera. Mette a disposizione un software di gestione e vendita di biglietti online, nonché l’emissione e il seguito degli ordini.",
          "La vendita del biglietto non è conclusa con ticketick. I diritti e gli obblighi nati dall’acquisto — compreso l’ingresso — esistono esclusivamente tra Acquirente e Cliente. Non si forma alcun contratto di spettacolo tra Acquirente e ticketick.",
          "Per lo spettacolo, il biglietto, un rimborso o l’accesso, l’Acquirente si rivolge unicamente al Cliente. ticketick non tratta tali richieste.",
        ],
      },
      {
        title: "2. Descrizione del servizio",
        paragraphs: [
          "Il Cliente definisce in autonomia le manifestazioni: titoli, testi, immagini, tariffe, contingenti, date di vendita e mezzi di pagamento.",
          "Un biglietto materializza un diritto d’ingresso. Consente all’Acquirente di presentarsi sul luogo indicato per beneficiare della prestazione del Cliente.",
          "ticketick può pubblicare le manifestazioni sul portale pubblico e, se il Cliente lo integra, tramite un modulo d’ordine su un sito terzo.",
        ],
      },
      {
        title: "3. Obblighi del Cliente",
        paragraphs: [
          "Il Cliente è responsabile di tutte le informazioni inserite: titolo, foto, testi, tariffe, contingenti, date e luogo. Si impegna a non indurre in errore l’Acquirente (pubblicità ingannevole, indicazioni false).",
          "Il Cliente garantisce che le manifestazioni rispettano l’ordine pubblico, la salute e i diritti dei terzi (diritto d’autore, marchi, immagine, licenze, diffusione). Tiene indenne ticketick da ogni pretesa di terzi legata a tali contenuti o alla manifestazione.",
          "Le autorizzazioni amministrative (polizia del fuoco, comuni, ecc.) e i relativi costi incombono unicamente al Cliente.",
        ],
      },
      {
        title: "4. Prezzi, incasso e imposte",
        paragraphs: [
          "Il prezzo di vendita del biglietto è fissato dal Cliente, in franchi svizzeri (CHF). Possono applicarsi spese di servizio o di transazione secondo il mezzo di pagamento.",
          "Il pagamento avviene tramite i prestatori proposti (PostFinance, Stripe, PayPal), secondo quanto aperto dal Cliente. I conti bancari e d’incasso appartengono al Cliente. Il Cliente è l’unico responsabile dell’incasso, della correttezza dei dati e di ogni riversamento.",
          "Il Cliente è l’unico responsabile del rendiconto fiscale delle vendite (IVA, imposte, diritti d’autore o connessi, tasse locali). ticketick non assume alcuna responsabilità per inadempienze del Cliente.",
        ],
      },
      {
        title: "5. Ordine ed emissione dei biglietti",
        paragraphs: [
          "L’ordine dell’Acquirente è vincolante solo dopo la conferma del pagamento. I posti possono essere trattenuti alcuni minuti durante il pagamento; oltre, tornano in vendita.",
          "I biglietti sono messi a disposizione per e-mail, come PDF stampabile e/o biglietto mobile con codice QR. Portano un identificativo unico. Una copia, uno screenshot o un trasferimento non autorizzato può essere rifiutato all’ingresso.",
        ],
      },
      {
        title: "6. Controllo dei biglietti e accessi",
        paragraphs: [
          "Il Cliente è l’unico responsabile del controllo dei biglietti e degli accessi. ticketick non ha alcun obbligo in materia.",
          "Si raccomanda di scansionare e convalidare ogni biglietto sul posto per evitare stampe multiple. ticketick mette a disposizione un’app di controllo; l’uso e il materiale restano a carico del Cliente.",
        ],
      },
      {
        title: "7. Rinvio, modifica e annullamento",
        paragraphs: [
          "Il Cliente assume da solo la piena responsabilità di un annullamento, di un rinvio o di una modifica sostanziale (data, ora, luogo o programma). Tale modifica è assimilata a un annullamento per l’applicazione delle presenti.",
          "Se i biglietti sono già stati venduti, il Cliente informa senza ritardo gli Acquirenti e ticketick. Spetta al Cliente rimborsare, offrire un buono o una nuova data. ticketick può inoltrare una richiesta, senza sostituirsi al Cliente.",
        ],
      },
      {
        title: "8. Responsabilità di ticketick",
        paragraphs: [
          "ticketick non è responsabile del numero di biglietti venduti, del successo economico della manifestazione, dell’esattezza delle informazioni inserite dal Cliente, di un’errata configurazione da parte del Cliente, né di un’indisponibilità dovuta alla rete Internet o a una causa indipendente da ticketick.",
          "Salvo negligenza grave, un’interruzione del servizio (manutenzione, miglioramento) non impegna la responsabilità di ticketick.",
          "Se la responsabilità di ticketick è impegnata, è limitata ai danni diretti e all’importo di un’eventuale tassa di servizio percepita per l’ordine interessato.",
        ],
      },
      {
        title: "9. Dati personali",
        paragraphs: [
          "Per i dati comunicati dall’Acquirente all’acquisto (identità, e-mail, ordine), il Cliente è responsabile del trattamento. ticketick agisce come subincaricato per l’emissione dei biglietti, il seguito dell’ordine e il controllo accessi.",
          "Le modalità sono precisate nella pagina Privacy.",
        ],
      },
      {
        title: "10. Modifiche e diritto applicabile",
        paragraphs: [
          "ticketick può adattare queste condizioni per tenere conto di un’evoluzione legale, tecnica o del servizio. Prevale la versione pubblicata su ticketick.ch.",
          "Si applica il diritto svizzero. Il foro è a Losanna, fatti salvi i fori obbligatori previsti dalla legge.",
        ],
      },
    ],
  },
};

const privacy: Record<LegalLocale, LegalDoc> = {
  fr: {
    updated: "Dernière mise à jour : 14 septembre 2026",
    lead: "Il faut distinguer les données que vous nous confiez pour utiliser ticketick.ch (compte, commande, support) et celles que l’organisateur traite pour son spectacle (liste des spectateurs, contrôle d’accès). Cette politique décrit le traitement effectué par ticketick, selon la nLPD et, le cas échéant, le RGPD.",
    sections: [
      {
        title: "1. Nos engagements",
        paragraphs: [
          "Nous recueillons le moins d’informations possible. Celles que nous demandons servent à livrer votre commande, sécuriser le service ou vous répondre.",
          "Usage restreint : nous ne partageons pas vos données avec des tiers sans raison valable. Traitement responsable : nous les protégeons comme les nôtres. Utilisation transparente : uniquement aux fins décrites ici.",
        ],
      },
      {
        title: "2. Qui est responsable ?",
        paragraphs: [
          "L’exploitant de ticketick.ch est responsable du traitement pour la plateforme (compte, paiement technique, envoi des billets, sécurité).",
          "Pour les données communiquées lors de l’achat d’un billet (identité, e-mail, commande), l’organisateur est responsable de traitement. ticketick agit alors comme sous-traitant : émission des billets, suivi de commande et contrôle d’accès.",
        ],
      },
      {
        title: "3. Quelles informations conservons-nous ?",
        paragraphs: [
          "Nom et prénom : pour vous identifier, émettre le billet et vous répondre. E-mail : pour envoyer les billets, confirmer la commande et, si vous y consentez, des informations sur les spectacles des organisateurs que vous suivez — vous pouvez vous désabonner.",
          "Téléphone (facultatif) : pour vous joindre au sujet d’une commande ou en cas d’urgence liée à un spectacle.",
          "Compte : identifiants, historique de commandes. Adresse IP et journaux techniques : pour sécuriser l’accès et détecter un usage abusif.",
          "Paiement : le moyen utilisé (carte, PostFinance, PayPal). Le numéro de carte n’est pas stocké chez ticketick ; il est traité par le prestataire de paiement. Nous pouvons conserver une référence de transaction et le montant.",
          "Usage du site : pages consultées, panier, langue, appareil — pour faire fonctionner le service et l’améliorer. Voir aussi les cookies ci-dessous.",
        ],
      },
      {
        title: "4. À quelles fins ?",
        paragraphs: [
          "Exécuter la commande et le contrat (émission du billet, e-mail, remboursement via l’organisateur).",
          "Fournir le service, le support et vous prévenir d’un événement qui affecte votre commande.",
          "Lutter contre la fraude et les usurpations d’identité.",
          "Respecter une obligation légale ou répondre à une autorité compétente.",
          "Améliorer le site, uniquement à partir de données nécessaires ou agrégées.",
        ],
      },
      {
        title: "5. Quand partageons-nous vos données ?",
        paragraphs: [
          "Uniquement pour fournir le service : prestataires de paiement (PostFinance, Stripe, PayPal), envoi d’e-mail, et l’organisateur du spectacle concerné (liste des titulaires de billets, contrôle d’accès).",
          "Ces tiers n’utilisent vos données que pour la prestation demandée. Nous pouvons aussi les communiquer si la loi ou une ordonnance l’exige.",
          "Nous ne vendons pas vos données et n’effectuons pas de profilage automatisé ni de décision fondée uniquement sur un traitement automatisé.",
        ],
      },
      {
        title: "6. Cookies",
        paragraphs: [
          "Des cookies ou technologies similaires sont nécessaires au panier, à la session, à la langue et à la sécurité. D’autres, facultatifs, peuvent servir à mesurer l’audience. Vous pouvez limiter les cookies non essentiels dans votre navigateur ; le service de commande peut alors être dégradé.",
        ],
      },
      {
        title: "7. Sécurité",
        paragraphs: [
          "Les formulaires et le paiement transitent de façon chiffrée. L’accès au compte est protégé ; nous recommandons un mot de passe unique et robuste, et de vous déconnecter sur un appareil partagé.",
          "ticketick ne peut garantir la sécurité sans votre collaboration : ne transmettez jamais vos identifiants.",
        ],
      },
      {
        title: "8. Durée de conservation",
        paragraphs: [
          "Nous ne conservons les données que le temps nécessaire à la finalité ou exigé par la loi (comptabilité, litiges). Les données d’une commande abandonnée sont en principe effacées dans les six mois.",
          "Vous pouvez demander la fermeture de votre compte et l’effacement de vos données, sous réserve des durées légales. Un délai d’environ 30 jours peut être nécessaire pour tout supprimer. Sans demande, les données de compte inactif sont effacées après les délais légaux.",
        ],
      },
      {
        title: "9. Vos droits",
        paragraphs: [
          "Vous pouvez demander l’accès, une copie portable, la rectification, la limitation, l’opposition ou l’effacement, conformément à la nLPD et, si vous êtes dans l’UE, au RGPD.",
          "Pour les données liées à un achat ou à un spectacle, adressez-vous à l’organisateur : c’est lui le responsable de traitement. ticketick n’est pas l’interlocuteur pour ces demandes.",
          "Pour les données de votre compte ticketick.ch uniquement, écrivez à support@ticketick.ch. Nous répondons dans les 30 jours. Cette page affiche toujours la version en vigueur.",
        ],
      },
    ],
  },
  en: {
    updated: "Last updated: 14 September 2026",
    lead: "Distinguish the data you give us to use ticketick.ch (account, order, support) from data the organiser processes for its event (attendee list, door control). This policy covers processing by ticketick under the nFADP and, where applicable, the GDPR.",
    sections: [
      {
        title: "1. Our commitments",
        paragraphs: [
          "We collect as little as possible. What we ask for is to deliver your order, secure the service or answer you.",
          "Limited use: we do not share your data with third parties without a valid reason. Responsible handling: we protect it as our own. Transparent use: only for the purposes described here.",
        ],
      },
      {
        title: "2. Who is the controller?",
        paragraphs: [
          "The operator of ticketick.ch is controller for the platform (account, payment processing, ticket email, security).",
          "For data given when buying a ticket (identity, email, order), the organiser is controller. ticketick then acts as processor: issuing tickets, tracking the order and door control.",
        ],
      },
      {
        title: "3. What information do we keep?",
        paragraphs: [
          "Name: to identify you, issue the ticket and reply. Email: to send tickets, confirm the order and, if you opt in, news from organisers you follow — you can unsubscribe.",
          "Phone (optional): to reach you about an order or an event emergency.",
          "Account: credentials and order history. IP address and technical logs: to secure access and detect abuse.",
          "Payment: the method used (card, PostFinance, PayPal). The card number is not stored by ticketick; the payment provider processes it. We may keep a transaction reference and the amount.",
          "Site use: pages viewed, cart, language, device — to run and improve the service. See cookies below.",
        ],
      },
      {
        title: "4. For what purposes?",
        paragraphs: [
          "To perform the order and the contract (ticket, email, refunds via the organiser).",
          "To provide the service, support, and to warn you of an event that affects your order.",
          "To prevent fraud and impersonation.",
          "To comply with the law or a competent authority.",
          "To improve the site, using only necessary or aggregated data.",
        ],
      },
      {
        title: "5. When do we share your data?",
        paragraphs: [
          "Only to provide the service: payment providers (PostFinance, Stripe, PayPal), email delivery, and the organiser of the event (ticket holders, door control).",
          "Those parties may use your data only for that task. We may also disclose data if the law or a court order requires it.",
          "We do not sell your data and do not carry out automated profiling or decisions based solely on automated processing.",
        ],
      },
      {
        title: "6. Cookies",
        paragraphs: [
          "Cookies or similar technologies are needed for the cart, session, language and security. Optional ones may measure audience. You can restrict non-essential cookies in your browser; checkout may then work less well.",
        ],
      },
      {
        title: "7. Security",
        paragraphs: [
          "Forms and payment travel encrypted. Account access is protected; use a unique strong password and sign out on a shared device.",
          "ticketick cannot secure your data without your help: never share your credentials.",
        ],
      },
      {
        title: "8. Retention",
        paragraphs: [
          "We keep data only as long as the purpose or the law requires (accounts, disputes). Abandoned checkout data are as a rule deleted within six months.",
          "You may ask us to close your account and erase your data, subject to legal retention. About 30 days may be needed to delete everything. Without a request, inactive account data are erased after the legal periods.",
        ],
      },
      {
        title: "9. Your rights",
        paragraphs: [
          "You may request access, a portable copy, correction, restriction, objection or erasure, under the nFADP and, if you are in the EU, the GDPR.",
          "For data linked to a purchase or an event, contact the organiser: they are the controller. ticketick is not the contact for those requests.",
          "For your ticketick.ch account data only, write to support@ticketick.ch. We reply within 30 days. This page always shows the current version.",
        ],
      },
    ],
  },
  de: {
    updated: "Letzte Aktualisierung: 14. September 2026",
    lead: "Unterscheiden Sie die Daten, die Sie uns für ticketick.ch anvertrauen (Konto, Bestellung, Support), von denen, die der Veranstalter für seine Vorstellung bearbeitet (Zuschauerliste, Einlass). Diese Richtlinie beschreibt die Bearbeitung durch ticketick nach nDSG und, soweit anwendbar, DSGVO.",
    sections: [
      {
        title: "1. Unsere Zusagen",
        paragraphs: [
          "Wir erheben so wenig wie möglich. Was wir verlangen, dient der Bestellung, der Sicherheit oder Ihrer Anfrage.",
          "Beschränkte Nutzung: keine Weitergabe an Dritte ohne triftigen Grund. Verantwortliche Bearbeitung: wir schützen die Daten wie unsere eigenen. Transparente Nutzung: nur zu den hier genannten Zwecken.",
        ],
      },
      {
        title: "2. Wer ist verantwortlich?",
        paragraphs: [
          "Die Betreiberin von ticketick.ch ist Verantwortliche für die Plattform (Konto, Zahlungsabwicklung, Ticketversand, Sicherheit).",
          "Für Daten beim Ticketkauf (Identität, E-Mail, Bestellung) ist der Veranstalter Verantwortlicher. ticketick handelt dann als Auftragsbearbeiterin: Ausstellung, Bestellverfolgung und Einlasskontrolle.",
        ],
      },
      {
        title: "3. Welche Angaben speichern wir?",
        paragraphs: [
          "Name: zur Identifikation, Ticketausstellung und Antwort. E-Mail: für Tickets, Bestätigung und — bei Einwilligung — Hinweise der Veranstalter, denen Sie folgen; Abmeldung ist jederzeit möglich.",
          "Telefon (freiwillig): bei Fragen zur Bestellung oder im Notfall zur Vorstellung.",
          "Konto: Zugangsdaten und Bestellhistorie. IP-Adresse und technische Protokolle: zur Absicherung und gegen Missbrauch.",
          "Zahlung: das verwendete Mittel (Karte, PostFinance, PayPal). Die Kartennummer speichert ticketick nicht; sie läuft über den Zahlungsanbieter. Wir können eine Transaktionsreferenz und den Betrag behalten.",
          "Nutzung der Website: Seiten, Warenkorb, Sprache, Gerät — zum Betrieb und zur Verbesserung. Siehe Cookies unten.",
        ],
      },
      {
        title: "4. Zu welchen Zwecken?",
        paragraphs: [
          "Erfüllung der Bestellung und des Vertrags (Ticket, E-Mail, Rückerstattung über den Veranstalter).",
          "Dienst, Support und Warnung, wenn ein Ereignis Ihre Bestellung betrifft.",
          "Betrugs- und Identitätsmissbrauchsprävention.",
          "Gesetzliche Pflichten oder Anfragen zuständiger Behörden.",
          "Verbesserung der Website, nur mit nötigen oder aggregierten Daten.",
        ],
      },
      {
        title: "5. Wann geben wir Daten weiter?",
        paragraphs: [
          "Nur zur Leistungserbringung: Zahlungsanbieter (PostFinance, Stripe, PayPal), E-Mail-Versand und der Veranstalter der Vorstellung (Ticketinhaber, Einlass).",
          "Diese Dritten nutzen die Daten nur für diese Aufgabe. Eine Weitergabe kann auch gesetzlich oder gerichtlich angeordnet sein.",
          "Wir verkaufen Ihre Daten nicht und treffen keine automatisierten Einzelentscheidungen oder Profilings.",
        ],
      },
      {
        title: "6. Cookies",
        paragraphs: [
          "Cookies oder ähnliche Technologien sind für Warenkorb, Sitzung, Sprache und Sicherheit nötig. Optionale können die Reichweite messen. Nicht notwendige Cookies können Sie im Browser einschränken; der Bestellvorgang kann dann eingeschränkt sein.",
        ],
      },
      {
        title: "7. Sicherheit",
        paragraphs: [
          "Formulare und Zahlung laufen verschlüsselt. Der Kontozugang ist geschützt; nutzen Sie ein einzigartiges, starkes Passwort und melden Sie sich auf geteilten Geräten ab.",
          "Ohne Ihre Mitwirkung kann ticketick die Sicherheit nicht gewährleisten: geben Sie Zugangsdaten nie weiter.",
        ],
      },
      {
        title: "8. Aufbewahrung",
        paragraphs: [
          "Daten bleiben nur so lange, wie Zweck oder Gesetz es verlangen (Buchhaltung, Streitigkeiten). Daten einer abgebrochenen Bestellung werden in der Regel innert sechs Monaten gelöscht.",
          "Sie können die Kontoschliessung und Löschung verlangen, vorbehaltlich gesetzlicher Fristen. Rund 30 Tage können nötig sein. Ohne Antrag werden inaktive Kontodaten nach den gesetzlichen Fristen gelöscht.",
        ],
      },
      {
        title: "9. Ihre Rechte",
        paragraphs: [
          "Sie können Auskunft, eine portable Kopie, Berichtigung, Einschränkung, Widerspruch oder Löschung verlangen — nach nDSG und, in der EU, nach DSGVO.",
          "Für Daten zu einem Kauf oder einer Vorstellung wenden Sie sich an den Veranstalter: er ist Verantwortlicher. ticketick ist dafür nicht die Ansprechstelle.",
          "Nur für Daten Ihres ticketick.ch-Kontos schreiben Sie an support@ticketick.ch. Wir antworten innert 30 Tagen. Diese Seite zeigt stets die geltende Fassung.",
        ],
      },
    ],
  },
  it: {
    updated: "Ultimo aggiornamento: 14 settembre 2026",
    lead: "Vanno distinti i dati che ci affidate per usare ticketick.ch (conto, ordine, supporto) da quelli che l’organizzatore tratta per il suo spettacolo (elenco spettatori, controllo accessi). Questa politica descrive il trattamento di ticketick, secondo la nLPD e, se del caso, il RGPD.",
    sections: [
      {
        title: "1. I nostri impegni",
        paragraphs: [
          "Raccogliamo il minimo indispensabile. Quanto chiediamo serve a evadere l’ordine, mettere in sicurezza il servizio o rispondervi.",
          "Uso limitato: non condividiamo i dati con terzi senza motivo valido. Trattamento responsabile: li proteggiamo come i nostri. Uso trasparente: solo per le finalità descritte qui.",
        ],
      },
      {
        title: "2. Chi è responsabile?",
        paragraphs: [
          "Il gestore di ticketick.ch è titolare del trattamento per la piattaforma (conto, pagamento tecnico, invio biglietti, sicurezza).",
          "Per i dati comunicati all’acquisto (identità, e-mail, ordine), l’organizzatore è titolare del trattamento. ticketick agisce allora come incaricato: emissione, seguito dell’ordine e controllo accessi.",
        ],
      },
      {
        title: "3. Quali informazioni conserviamo?",
        paragraphs: [
          "Nome: per identificarvi, emettere il biglietto e rispondervi. E-mail: per inviare i biglietti, confermare l’ordine e, se acconsentite, informazioni degli organizzatori che seguite — potete disiscrivervi.",
          "Telefono (facoltativo): per un ordine o un’urgenza legata allo spettacolo.",
          "Conto: credenziali e storico ordini. Indirizzo IP e registri tecnici: per mettere in sicurezza l’accesso e rilevare abusi.",
          "Pagamento: il mezzo usato (carta, PostFinance, PayPal). Il numero di carta non è conservato da ticketick; lo tratta il prestatore. Possiamo conservare un riferimento di transazione e l’importo.",
          "Uso del sito: pagine, carrello, lingua, dispositivo — per far funzionare e migliorare il servizio. Vedi i cookie sotto.",
        ],
      },
      {
        title: "4. Per quali finalità?",
        paragraphs: [
          "Eseguire l’ordine e il contratto (biglietto, e-mail, rimborso tramite l’organizzatore).",
          "Fornire il servizio, il supporto e avvisarvi se un evento riguarda il vostro ordine.",
          "Prevenire frodi e usurpazioni d’identità.",
          "Rispettare un obbligo di legge o una richiesta dell’autorità.",
          "Migliorare il sito, solo con dati necessari o aggregati.",
        ],
      },
      {
        title: "5. Quando condividiamo i dati?",
        paragraphs: [
          "Solo per erogare il servizio: prestatori di pagamento (PostFinance, Stripe, PayPal), invio e-mail e l’organizzatore dello spettacolo (titolari dei biglietti, controllo accessi).",
          "Tali terzi usano i dati solo per quella prestazione. Possiamo comunicarli anche se la legge o un’ordinanza lo esige.",
          "Non vendiamo i dati e non effettuiamo profilazione automatizzata né decisioni fondate unicamente su un trattamento automatizzato.",
        ],
      },
      {
        title: "6. Cookie",
        paragraphs: [
          "Cookie o tecnologie simili sono necessari per carrello, sessione, lingua e sicurezza. Altri, facoltativi, possono misurare l’audience. Potete limitare i cookie non essenziali nel browser; l’ordine può allora funzionare peggio.",
        ],
      },
      {
        title: "7. Sicurezza",
        paragraphs: [
          "Moduli e pagamento transitano cifrati. L’accesso al conto è protetto; usate una password unica e robusta e disconnettetevi su un dispositivo condiviso.",
          "ticketick non può garantire la sicurezza senza la vostra collaborazione: non comunicate mai le credenziali.",
        ],
      },
      {
        title: "8. Durata di conservazione",
        paragraphs: [
          "Conserviamo i dati solo per il tempo della finalità o richiesto dalla legge (contabilità, controversie). I dati di un ordine abbandonato sono di regola cancellati entro sei mesi.",
          "Potete chiedere la chiusura del conto e la cancellazione, fatti salvi i termini di legge. Possono occorrere circa 30 giorni. Senza richiesta, i dati di un conto inattivo sono cancellati dopo i termini legali.",
        ],
      },
      {
        title: "9. I vostri diritti",
        paragraphs: [
          "Potete chiedere l’accesso, una copia portabile, la rettifica, la limitazione, l’opposizione o la cancellazione, secondo la nLPD e, se siete nell’UE, il RGPD.",
          "Per i dati legati a un acquisto o a uno spettacolo, rivolgetevi all’organizzatore: è lui il titolare del trattamento. ticketick non è l’interlocutore per tali richieste.",
          "Solo per i dati del vostro conto ticketick.ch, scrivete a support@ticketick.ch. Rispondiamo entro 30 giorni. Questa pagina mostra sempre la versione in vigore.",
        ],
      },
    ],
  },
};

export function legalLocale(locale: string): LegalLocale {
  if (locale === "en" || locale === "de" || locale === "it") return locale;
  return "fr";
}

export function termsCopy(locale: string): LegalDoc {
  return terms[legalLocale(locale)];
}

export function privacyCopy(locale: string): LegalDoc {
  return privacy[legalLocale(locale)];
}
