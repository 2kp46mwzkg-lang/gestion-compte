// Catégories et classement automatique des opérations.
//
// Ordre de priorité pour classer une opération :
//   1. le choix fait à la main pour CETTE opération
//   2. la règle apprise pour ce commerçant / ce libellé (quand tu corriges une catégorie)
//   3. les règles par mots-clés ci-dessous
//   4. par défaut : « À classer » pour une dépense, « Autres revenus » pour une rentrée

import { normalize } from './lcl.js';

// type : revenu | depense | epargne | interne
// fixe : charge fixe (true) ou dépense variable (false)
export const CATEGORIES = [
  { id: 'salaire',     label: 'Salaire',                    icon: '💼', type: 'revenu' },
  { id: 'revenus',     label: 'Autres revenus',             icon: '💶', type: 'revenu' },

  { id: 'logement',    label: 'Logement & charges',         icon: '🏠', type: 'depense', fixe: true },
  { id: 'credits',     label: 'Crédits',                    icon: '🏦', type: 'depense', fixe: true },
  { id: 'impots',      label: 'Impôts & taxes',             icon: '🏛️', type: 'depense', fixe: true },
  { id: 'assurances',  label: 'Assurances',                 icon: '🛡️', type: 'depense', fixe: true },
  { id: 'telecom',     label: 'Téléphone & internet',       icon: '📱', type: 'depense', fixe: true },
  { id: 'abonnements', label: 'Abonnements & numérique',    icon: '🔁', type: 'depense', fixe: true },
  { id: 'banque',      label: 'Frais bancaires',            icon: '💳', type: 'depense', fixe: true },

  { id: 'courses',     label: 'Courses & alimentation',     icon: '🛒', type: 'depense' },
  { id: 'restos',      label: 'Restos, cafés & livraison',  icon: '🍽️', type: 'depense' },
  { id: 'transport',   label: 'Transport & voiture',        icon: '🚗', type: 'depense' },
  { id: 'loisirs',     label: 'Loisirs & jeux',             icon: '🎮', type: 'depense' },
  { id: 'voyages',     label: 'Voyages & vacances',         icon: '✈️', type: 'depense' },
  { id: 'maison',      label: 'Maison & bricolage',         icon: '🔨', type: 'depense' },
  { id: 'shopping',    label: 'Shopping',                   icon: '🛍️', type: 'depense' },
  { id: 'sante',       label: 'Santé & soins',              icon: '🩺', type: 'depense' },
  { id: 'cadeaux',     label: 'Cadeaux & dons',             icon: '🎁', type: 'depense' },
  { id: 'divers',      label: 'Divers',                     icon: '📦', type: 'depense' },
  { id: 'a_classer',   label: 'À classer',                  icon: '❓', type: 'depense' },

  { id: 'epargne',     label: 'Épargne & placements',       icon: '🐷', type: 'epargne' },
  { id: 'transferts',  label: 'Vers mes autres comptes',    icon: '🔄', type: 'interne' },
];

export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// Règles par mots-clés (testées dans l'ordre, la première qui correspond gagne).
// sens : 'debit' = seulement les sorties d'argent, 'credit' = seulement les rentrées,
//        absent = les deux (un remboursement Amazon fait baisser le total « Shopping »).
// vir : true = la règle s'applique aussi aux virements (sinon seulement CB / prélèvements).
const RULES = [
  { cat: 'salaire',     sens: 'credit', vir: true, re: /NATURE DU PAIEMENT:SALA|SALAIRE|\bPAIE\b/ },
  { cat: 'epargne',     vir: true, re: /SYSTEM' ?EPARGNE|LIVRET|EPARGNE|\bPEA\b|ASSURANCE VIE|VERSEMENT REGULIER|\bPER\b|PLACEMENT|\bLDDS?\b/ },
  { cat: 'credits',     sens: 'debit', vir: true, re: /ECHEANCE PRET|\bPRET\b|CREDIT IMMO|COFIDIS|CETELEM|SOFINCO|\bFLOA\b|\bONEY\b|YOUNITED|FRANFINANCE/ },
  { cat: 'impots',      vir: true, re: /TAXES? FONCIERES?|TAXE D'HABITATION|IMPOTS?|DGFIP|TRESOR PUBLIC|\bANTAI\b|AMENDE/ },
  { cat: 'logement',    vir: true, re: /COPROPRIETE|\bSYNDIC|\bLOYER|\bEDF\b|ENGIE|EKWATEUR|TOTALENERGIES ELEC|MEGA ENERGIE|VEOLIA|\bSUEZ\b|EAU DU|\bSAUR\b|GRDF|OHM ENERGIE/ },
  { cat: 'banque',      vir: true, re: /^COTISATION|ASSURANCE MOYEN DE PAIEMENT|^FRAIS|COMMISSION|INTERETS DEBITEURS|AGIOS|COM(MISSION)? D'INTERVENTION|OFFRE (GROUPEE|ESSENTIEL)|TENUE DE COMPTE|SERVICES DE COMPTE/ },
  { cat: 'assurances',  vir: true, re: /GARANTIE EMPRUNTEUR|ASSURANCE|MUTUELLE|PREVOYANCE|\bMAAF\b|\bMACIF\b|\bMAIF\b|\bAXA\b|ALLIANZ|\bGMF\b|MATMUT|GROUPAMA|PACIFICA|HARMONIE|\bALAN\b|DIRECT ASSURANCE|LEOCARE/ },
  { self: true }, // virement entre deux comptes à ton nom
  { cat: 'transferts',  vir: true, re: /REVOLUT|COMPTE DE DEPOTS|COMPTE COURANT|COMPTE JOINT|\bWISE\b|\bN26\b|BOURSORAMA|FORTUNEO|HELLO BANK|\bLYDIA\b|SUMERIA/ },
  { cat: 'telecom',     vir: true, re: /\bORANGE\b|\bSFR\b|BOUYGUES|FREE MOBILE|FREE TELECOM|FREEBOX|\bSOSH\b|RED BY SFR|B&YOU|PRIXTEL|LA POSTE MOBILE|NRJ MOBILE|SYMA/ },

  // Commerçants (paiements CB et prélèvements)
  { cat: 'abonnements', re: /NETFLIX|SPOTIFY|DISNEY|AMAZON PRIME|AMAZON MEDIA|PRIME VIDEO|APPLE\.COM|ITUNES|\bGOOGLE\b|DEEZER|CANAL ?\+|CANALPLUS|YOUTUBE|ADOBE|MICROSOFT|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|ICLOUD|AUDIBLE|KINDLE|CRUNCHYROLL|DAZN|PARAMOUNT|BASIC ?FIT|FITNESS PARK|KEEP COOL|NEONESS|PATREON/ },
  { cat: 'courses',     re: /CARREFOUR|LECLERC|AUCHAN|INTERMARCHE|\bLIDL\b|\bALDI\b|CASINO|MONOPRIX|FRANPRIX|SUPER U\b|HYPER U\b|\bU EXPRESS|BIOCOOP|PICARD|GRAND FRAIS|\bNETTO\b|BOULANGERIE|BOUCHERIE|FROMAGERIE|PRIMEUR|HALLES|\bMARCHE\b|\bSPAR\b|\bPROXI\b|\bVIVAL\b|NATURALIA|LA VIE CLAIRE|\bCORA\b|\bMATCH\b|O'TERA|\bLECL\b/ },
  { cat: 'restos',      re: /DELIVEROO|UBER ?EATS|JUST ?EAT|STARBUCK|MC ?DONALD|\bMCDO|BURGER|\bKFC\b|\bQUICK\b|SUBWAY|RESTAURANT|\bRESTO\b|BRASSERIE|PIZZ|SUSHI|\bCAFE\b|COFFEE|\bBAR\b|KEBAB|TACOS|\bBOCO\b|COLUMBUS|\bAREAS\b|\bELIOR\b|\bCROUS\b|GLACIER|BISTRO|TRAITEUR|\bPUB\b|\bSNACK/ },
  { cat: 'transport',   re: /PEAGE|FULLI|BIP ?& ?GO|\bAPRR\b|VINCI AUTO|\bASF\b|SANEF|TOTAL ?ENERGIES|\bTOTAL\b|\bESSO\b|SHELL|\bBP\b|\bAVIA\b|CARBURANT|SNCF|\bTCL\b|\bRATP\b|\bUBER\b(?! ?EATS)|BLABLACAR|PARKING|INDIGO|EFFIA|ONEPARK|ZENPARK|NORAUTO|FEU VERT|\bMIDAS\b|SPEEDY|CONTROLE TECHNIQUE|\bVELO'?V\b|\bLIME\b/ },
  { cat: 'voyages',     re: /HOTEL|AIRBNB|BOOKING|RYANAIR|EASYJET|AIR ?FRANCE|VOLOTEA|TRANSAVIA|VUELING|LUFTHANSA|ABRITEL|CAMPING|CENTER PARCS|TRAINLINE|OUIGO|FLIXBUS|AEROPORT/ },
  { cat: 'loisirs',     re: /STEAM|PLAYSTATION|SONY INTERACT|NINTENDO|\bXBOX\b|EPIC GAMES|GAMES WORKSHOP|WARHAMMER|CINEMA|PATHE|\bUGC\b|GAUMONT|CULTURA|MICROMANIA|INSTANT GAMING|TWITCH|CONCERT|TICKETMASTER|BILLETTERIE|MUSEE|BOWLING|ESCAPE|DECATHLON|LIBRAIRIE|\bFNAC\b/ },
  { cat: 'maison',      re: /MANOMANO|LEROY MERLIN|CASTORAMA|BRICO|\bIKEA\b|\bBUT\b|CONFORAMA|MAISONS DU MONDE|\bGIFI\b|FOIR'?FOUILLE|JARDILAND|TRUFFAUT|BOTANIC|WELDOM/ },
  { cat: 'shopping',    re: /AMAZON|\bAMZN|CDISCOUNT|ZALANDO|VINTED|\bACTION\b|\bH ?& ?M\b|\bZARA\b|KIABI|DARTY|\bBOULANGER\b|SEPHORA|NOCIBE|PRIMARK|UNIQLO|\bJULES\b|\bCELIO\b|SHEIN|\bTEMU\b|ALIEXPRESS|LEBONCOIN|APPLE STORE/ },
  { cat: 'sante',       re: /PHARMACIE|PHARMA|MEDECIN|\bDR\b|DOCTEUR|DENTISTE|DENTAIRE|OPTIC|OPTIQUE|\bKINE|LABO|HOPITAL|CLINIQUE|DOCTOLIB|OSTEO|\bBARB|COIFF|ESTHETI/ },
];

// Lignes de détail sans intérêt pour reconnaître une opération
const NOISE_DETAIL = /^(OPTION SYSTEM|COM CHANGE|REF\.|REF\s|ID\.CREANCIER|CREANCIER INITIAL|REF\.MANDAT|[\d\s/-]+$)/;

export function matchText(tx) {
  const useful = tx.details.map(normalize).filter(d => !NOISE_DETAIL.test(d));
  return normalize([tx.label, ...useful].join(' '));
}

const isVirement = tx => /^VIR/.test(normalize(tx.label));

/**
 * Clé d'un commerçant / libellé : sert à retenir tes corrections.
 * « CB STARBUCKS 04/08/26 » et « CB STARBUCKS 21/09/26 » ont la même clé.
 */
export function merchantKey(tx) {
  let l = normalize(tx.label).replace(/\s\d{2}\/\d{2}\/\d{2}$/, '');
  let key = l.replace(/[0-9*]+/g, ' ').replace(/[^A-Z&'.\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(VIR|PRLV)/.test(l) && tx.details.length) {
    const second = normalize(tx.details[0]);
    if (second && !/^(LIBELLE:|REF|ID\.|CREANCIER|NATURE)/.test(second)) {
      key += ' | ' + second.replace(/[0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return key;
}

const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'a', 'au', 'aux', 'en', 'sur', 'd', 'l']);
function titleCase(s) {
  return s.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => {
    if (/\d/.test(w)) return w.toUpperCase();
    if (i > 0 && SMALL.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}
const fixLcl = s => s.replace(/\{/g, 'é');

/** Nom lisible + sous-titre pour l'affichage */
export function displayName(tx) {
  const label = fixLcl(tx.label.trim());
  const n = normalize(label);
  const details = tx.details.map(fixLcl);
  const libelle = details.map(d => d.match(/^LIBELLE:\s*(.+)$/i)).find(Boolean);
  const libVal = libelle ? libelle[1].split('/')[0].trim() : '';

  if (/^CB\b/.test(n)) {
    const name = label.replace(/^CB\s+/i, '').replace(/\s\d{2}\/\d{2}\/\d{2}$/, '')
      .replace(/\*+\d*\*?/g, ' ').replace(/\s\d{4,}\b/g, '').replace(/\s+/g, ' ').trim();
    const fx = details.find(d => /\b[A-Z]{3}\s+[\d ]+,\d{2}$/.test(d));
    return { name: titleCase(name), sub: fx ? 'Paiement en devise : ' + fx.replace(/\s+/g, ' ') : 'Carte bancaire' };
  }
  if (/^VIR\.?PERMANENT/.test(n)) {
    let who = label.replace(/^VIR\.?PERMANENT\s*/i, '').trim();
    const purpose = details[0] && !/^LIBELLE:|^REF|^NATURE/i.test(details[0]) ? details[0].replace(/^MOBILE\s+/i, '').trim() : '';
    if (!who || /^null$/i.test(who)) who = 'Sans libellé';
    const p = purpose && !/^virement permanent$/i.test(purpose) ? purpose : '';
    return { name: titleCase(who) + (p ? ' — ' + p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''), sub: 'Virement permanent' };
  }
  if (/^(VIR|VIREMENT)\b/.test(n)) {
    const who = label.replace(/^(VIR(EMENT)?(\s+(SEPA|INST))?)\s*/i, '').replace(/^M\.?\s+|^MME\s+/i, '').trim();
    const dir = tx.amount > 0 ? 'Virement reçu' : 'Virement émis';
    return { name: titleCase(who || label), sub: dir + (libVal ? ' : ' + libVal : '') };
  }
  if (/^PRLV/.test(n)) {
    const who = label.replace(/^PRLV\s+(SEPA\s+)?/i, '').trim();
    const sub = libVal && !/^PREL$/i.test(libVal) ? libVal.replace(/\s+ECHEANCE.*$/i, '') : 'Prélèvement';
    return { name: titleCase(who), sub };
  }
  if (/^TOTAL OPTION SYSTEM/.test(n)) {
    return { name: "Arrondis System'Épargne", sub: details[0] ? titleCase(details[0]) : 'Épargne automatique' };
  }
  const sub = details[0] && !/^\S{12,}$/.test(details[0].trim()) ? details[0] : '';
  return { name: titleCase(label.replace(/\s\d{4,}$/, '')), sub };
}

/** Nom du titulaire -> mots à retrouver pour repérer un virement « à soi-même » */
export function holderTokens(holder) {
  return normalize(holder || '').split(' ').filter(w => w.length > 1 && !['M', 'MR', 'MME', 'MLLE', 'MONSIEUR', 'MADAME'].includes(w));
}

/** Catégorie automatique (sans les choix manuels). Renvoie { cat, source } */
export function autoCategory(tx, ctx = {}) {
  const text = matchText(tx);
  const vir = isVirement(tx);
  const sens = tx.amount < 0 ? 'debit' : 'credit';
  for (const r of RULES) {
    if (r.self) {
      const toks = ctx.holderTokens || [];
      if (vir && toks.length && toks.every(t => text.includes(t))) return { cat: 'transferts', source: 'auto' };
      continue;
    }
    if (r.sens && r.sens !== sens) continue;
    if (vir && !r.vir) continue;
    if (r.re.test(text)) return { cat: r.cat, source: 'auto' };
  }
  return { cat: sens === 'debit' ? 'a_classer' : 'revenus', source: 'defaut' };
}

/**
 * Catégorie finale d'une opération.
 * state.overrides[txId] : choix pour cette opération seulement
 * state.rules[clé]      : règle apprise pour ce commerçant
 */
export function categorize(tx, state, ctx) {
  if (state.overrides && state.overrides[tx.id]) return { cat: state.overrides[tx.id], source: 'manuel' };
  const key = merchantKey(tx);
  if (state.rules && state.rules[key]) return { cat: state.rules[key], source: 'regle' };
  return autoCategory(tx, ctx);
}
