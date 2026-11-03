// Habitats déduits de la BD Forêt V2 (champs tfv / essence).
export const HABITATS = {
  pin: 'Pin maritime',
  conifere: 'Autres conifères',
  chene: 'Chênes caducs',
  chene_vert: 'Chênes verts / lièges',
  feuillus: 'Feuillus mélangés',
  melange: 'Forêt mixte',
  autre: 'Autre',
};

export function habitatFromForest(props) {
  const t = `${props.tfv || ''} ${props.essence || ''}`.toLowerCase();
  if (t.includes('lande') || t.includes('peupleraie')) return 'autre';
  if (t.includes('mélange') || t.includes('melange') || t.includes('mixte')) {
    if (t.includes('conif') && t.includes('feuill')) return 'melange';
    if (t.includes('feuill')) return 'feuillus';
    if (t.includes('conif')) return 'conifere';
  }
  if (t.includes('pin maritime')) return 'pin';
  if (t.includes('sempervirent') || t.includes('liège') || t.includes('liege') || t.includes('chêne vert')) return 'chene_vert';
  if (t.includes('chêne') || t.includes('chene')) return 'chene';
  if (t.includes('pin') || t.includes('conif') || t.includes('sapin') || t.includes('douglas')) return 'conifere';
  if (t.includes('feuill')) return 'feuillus';
  return 'autre';
}

// Valeurs issues d'une revue de la littérature (nov. 2026). Chaque espèce porte ses sources
// et le niveau de fiabilité de chaque réglage : « mesuré » (étude de terrain), « règle »
// (consensus de cueilleurs / guides régionaux), « estimé » (aucune donnée, à caler au carnet).
// Aucun réglage n'a été calibré en forêt landaise : le carnet reste la référence.
export const DEFAULT_SPECIES = [
  {
    id: 'cepes', ordre: 1, nom: 'Cèpes', latin: 'Boletus edulis, aereus, pinophilus',
    habitats: ['pin', 'chene', 'chene_vert', 'melange', 'feuillus'],
    arbres: 'Chênes et pins maritimes, surtout en lisière, talus moussus, bords de pare-feu.',
    mois: [8, 9, 10, 11], pluieMm: 30, pluieJours: 4, latenceMin: 10, latencePic: 13, latenceMax: 20,
    tmoyMin: 7, tmoyMax: 19, chaleurSeche: 17.5, vieillissement: 1,
    gelSeuil: 0, gelNuits: 1, chaleurMax: 27, secJours: 6, chocFroid: 0.1,
    conseils: [
      'Le chapeau dépasse à peine des aiguilles et de la mousse : marche lentement, regarde en biais.',
      'Tête de nègre (aereus) plutôt sous les chênes et par temps doux ; cèpe de Bordeaux (edulis) plus tard, au frais.',
      'Un cèpe trouvé : fouille 3 à 5 m autour, ils poussent rarement seuls.',
    ],
    confusions: 'Bolet amer (Tylopilus felleus) : réseau sombre sur le pied, pores qui virent au rose, goût très amer. Non toxique mais il ruine un plat.',
    sources: [
      { quoi: 'Température moyenne 7–19 °C, optimum ≈ 13 °C', fiab: 'mesuré', ref: 'Brejon Lamartinière & Hoffman 2025, suivi de 10 ans (préprint bioRxiv), hêtraie Allemagne' },
      { quoi: 'Aucune pousse si moyenne 5 j > 17,5 °C et sans pluie', fiab: 'mesuré', ref: 'Brejon Lamartinière & Hoffman 2025' },
      { quoi: 'Pluie ≥ 30 mm (50 mm plus sûr) en 2 à 4 j', fiab: 'règle', ref: 'Regione Piemonte ; Couleurs Lozère n°54 (2020)' },
      { quoi: 'Premiers chapeaux 10 à 15 j après la pluie (8 à 20 j)', fiab: 'règle', ref: 'Piemonte ; Lozère ; livret « Les chemins vers les champignons » (Pyrénées)' },
      { quoi: 'Plus rapide au chaud (~8 j à 20 °C), plus lent au frais (~20 j à 10 °C)', fiab: 'règle', ref: 'Livret Pyrénées' },
      { quoi: 'Poussée de 8 à 15 j', fiab: 'mesuré', ref: 'Pinna et al. 2010, Forest Ecology and Management' },
      { quoi: 'Sol qui garde l’eau : moins de pluie nécessaire', fiab: 'règle', ref: 'Livret Pyrénées (10 mm à 100 mm selon le sol)' },
      { quoi: 'Coup de froid déclencheur', fiab: 'estimé', ref: 'Straatsma 2001 cité par Pinna 2010 ; non démontré' },
      { quoi: 'Pluie de fin d’été-début d’automne = principal moteur de la saison', fiab: 'mesuré', ref: 'Martínez de Aragón 2007 ; Alday 2017 ; Karavani 2018 (pin maritime)' },
    ],
  },
  {
    id: 'girolle', ordre: 2, nom: 'Girolle', latin: 'Cantharellus cibarius',
    habitats: ['pin', 'chene', 'melange', 'feuillus', 'conifere'],
    arbres: 'Pins et chênes sur sol sableux acide et moussu (pH 4 à 5,5), bords de chemins.',
    mois: [5, 6, 7, 8, 9, 10, 11, 12], pluieMm: 20, pluieJours: 5, latenceMin: 10, latencePic: 18, latenceMax: 40,
    tmoyMin: 10, tmoyMax: 22, chaleurSeche: 99, vieillissement: 0,
    gelSeuil: -1, gelNuits: 1, chaleurMax: 32, secJours: 7, chocFroid: 0,
    conseils: [
      'Pousse en lignes ou en ronds : une girolle en annonce d’autres.',
      'Pousse lente : un même coin produit plusieurs semaines, repasse régulièrement.',
    ],
    confusions: 'Fausse girolle (Hygrophoropsis aurantiaca) : vraies lames fines et serrées, orange plus vif. Clitocybe de l’olivier, toxique, en touffes sur souches ou racines.',
    sources: [
      { quoi: 'Un même champignon dure en moyenne 44 j (jusqu’à 90+)', fiab: 'mesuré', ref: 'Largent & Sime 1995 ; Norvell 1995, cités par Pilz et al. 2003 (USDA)' },
      { quoi: 'Presque jamais véreuse (< 1 %)', fiab: 'mesuré', ref: 'Hackman & Meinander 1979, Finlande' },
      { quoi: 'Pluie d’été (juin-juillet) = moteur de la production', fiab: 'mesuré', ref: 'Modèle national finlandais, Forests 2019' },
      { quoi: 'Le sec arrête une poussée en cours', fiab: 'mesuré', ref: 'Pilz, Molina & Mayo 2006, Journal of Forestry' },
      { quoi: 'Saison de mai à décembre dans l’Ouest', fiab: 'règle', ref: 'Fourré 2000, Bull. SBCO' },
      { quoi: 'Sol acide pH 4–5,5', fiab: 'mesuré', ref: 'Danell 1994 (thèse Uppsala)' },
      { quoi: 'Seuil de pluie, délai, températures', fiab: 'estimé', ref: 'Aucune donnée publiée : valeurs de départ à caler au carnet' },
    ],
  },
  {
    id: 'chanterelle-tube', ordre: 3, nom: 'Chanterelle en tube', latin: 'Craterellus tubaeformis',
    habitats: ['pin', 'conifere', 'melange'],
    arbres: 'Pinèdes humides, mousses épaisses, et surtout près du bois mort bien décomposé.',
    mois: [9, 10, 11, 12, 1], pluieMm: 20, pluieJours: 5, latenceMin: 12, latencePic: 20, latenceMax: 35,
    tmoyMin: 2, tmoyMax: 12, chaleurSeche: 99, vieillissement: 0.3,
    gelSeuil: -5, gelNuits: 3, chaleurMax: 20, secJours: 8, chocFroid: 0.1,
    conseils: [
      'Cherche près des souches et branches pourries couvertes de mousse : c’est là qu’elle pousse le plus.',
      'Forme de grandes colonies : repère un pied puis regarde au ras du sol autour.',
      'Espèce de fin de saison, quand les cèpes s’arrêtent.',
    ],
    confusions: 'Vérifier les plis décurrents (pas de vraies lames) et le pied creux jaune-gris. Ne pas confondre avec de petits cortinaires bruns, dont certains sont mortels.',
    sources: [
      { quoi: '88 % des pieds sur du bois mort décomposé', fiab: 'mesuré', ref: 'Trappe 2004, Mycologia (Oregon)' },
      { quoi: 'Saison longue (~5 mois), tardive, de septembre à l’hiver', fiab: 'mesuré', ref: 'Capinha et al. 2024, BioScience (données participatives Europe)' },
      { quoi: 'Tolérance au gel, délai, seuil de pluie, températures', fiab: 'estimé', ref: 'Aucune donnée publiée : valeurs de départ à caler au carnet' },
    ],
  },
  {
    id: 'lactaire-delicieux', ordre: 4, nom: 'Lactaire délicieux', latin: 'Lactarius deliciosus',
    habitats: ['pin', 'conifere', 'melange'],
    arbres: 'Pins, y compris pin maritime : surtout jeunes plantations (10–20 ans), éclaircies, lisières herbeuses.',
    mois: [9, 10, 11, 12], pluieMm: 25, pluieJours: 5, latenceMin: 10, latencePic: 13, latenceMax: 20,
    tmoyMin: 8, tmoyMax: 16, chaleurSeche: 99, vieillissement: 1,
    gelSeuil: -1, gelNuits: 2, chaleurMax: 25, secJours: 6, chocFroid: 0,
    conseils: [
      'Préfère les jeunes pinèdes de 10 à 20 ans et les parcelles récemment éclaircies.',
      'Casse une lame : un lait orange carotte qui verdit en séchant est le bon signe.',
    ],
    confusions: 'Lactaires à lait blanc, ou dont le lait vire au violet : à laisser. Le lactaire sanguin (lait rouge vin) est aussi comestible.',
    sources: [
      { quoi: 'Pluie de fin août à octobre = moteur (+28 % de chances de présence par 10 mm)', fiab: 'mesuré', ref: 'Taye et al. 2016, pin maritime, Espagne (17 ans)' },
      { quoi: 'Pic en octobre-novembre', fiab: 'mesuré', ref: 'Taye et al. 2016' },
      { quoi: 'Jeunes peuplements (11–20 ans) et éclaircies : jusqu’à ×5', fiab: 'mesuré', ref: 'Ágreda 2014 ; Bonet 2012' },
      { quoi: 'Sable pur moins productif que sable limoneux (rétention d’eau)', fiab: 'mesuré', ref: 'Taye et al. 2016' },
      { quoi: 'Jours 12–20 °C, nuits > 5 °C favorables', fiab: 'règle', ref: 'Bulletin MICOCYL 2024 (Castille-et-León)' },
      { quoi: 'Délai 10–15 j après la pluie', fiab: 'règle', ref: 'Presse spécialisée espagnole' },
      { quoi: 'Gel, durée de vie, larves', fiab: 'estimé', ref: 'Aucune donnée publiée' },
    ],
  },
];
