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

// Valeurs de départ, modifiables depuis l'app.
// Cèpes : plage de température moyenne calée sur un suivi de 10 ans (optimum ≈ 13–15 °C,
// fructifications surtout entre 7 et 19 °C, aucune au-dessus de 17,5 °C par temps sec).
// Délai de 1 à 2 semaines après la pluie, poussée d'environ une semaine : règle des cueilleurs.
// Girolle, chanterelle en tube, lactaire : estimations à caler avec le carnet.
export const DEFAULT_SPECIES = [
  {
    id: 'cepes', ordre: 1, nom: 'Cèpes', latin: 'Boletus edulis, aereus, pinophilus',
    habitats: ['pin', 'chene', 'chene_vert', 'melange', 'feuillus'],
    arbres: 'Chênes et pins maritimes, surtout en lisière, talus moussus, bords de pare-feu.',
    mois: [8, 9, 10, 11], pluieMm: 30, pluieJours: 5, latenceMin: 8, latencePic: 11, latenceMax: 16,
    tmoyMin: 7, tmoyMax: 17, vieillissement: 1, gelSeuil: 0, gelNuits: 1, chaleurMax: 25, secJours: 6, chocFroid: 0.12,
    conseils: [
      'Le chapeau dépasse à peine des aiguilles et de la mousse : marche lentement, regarde en biais.',
      'Tête de nègre plutôt sous les chênes au chaud, cèpe des pins sous les pins.',
      'Un cèpe trouvé : fouille 3 à 5 m autour, ils poussent rarement seuls.',
    ],
    confusions: 'Bolet amer (Tylopilus felleus) : réseau sombre sur le pied, pores qui virent au rose, goût très amer. Non toxique mais il ruine un plat.',
  },
  {
    id: 'girolle', ordre: 2, nom: 'Girolle', latin: 'Cantharellus cibarius',
    habitats: ['pin', 'chene', 'melange', 'feuillus', 'conifere'],
    arbres: 'Pins et chênes sur sol sableux moussu, bords de chemins.',
    mois: [6, 7, 8, 9, 10, 11], pluieMm: 20, pluieJours: 5, latenceMin: 6, latencePic: 10, latenceMax: 20,
    tmoyMin: 10, tmoyMax: 20, vieillissement: 0.2, gelSeuil: -1, gelNuits: 1, chaleurMax: 30, secJours: 7, chocFroid: 0,
    conseils: [
      'Pousse en lignes ou en ronds : une girolle en annonce d’autres.',
      'Pousse lente et longue : un même coin produit plusieurs semaines.',
    ],
    confusions: 'Fausse girolle (Hygrophoropsis aurantiaca) : vraies lames fines et serrées, orange plus vif. Clitocybe de l’olivier, toxique, en touffes sur souches ou racines.',
  },
  {
    id: 'chanterelle-tube', ordre: 3, nom: 'Chanterelle en tube', latin: 'Craterellus tubaeformis',
    habitats: ['pin', 'conifere', 'melange'],
    arbres: 'Pinèdes humides, mousses épaisses, près du bois pourrissant.',
    mois: [10, 11, 12, 1], pluieMm: 20, pluieJours: 5, latenceMin: 7, latencePic: 12, latenceMax: 25,
    tmoyMin: 2, tmoyMax: 12, vieillissement: 0.3, gelSeuil: -5, gelNuits: 3, chaleurMax: 20, secJours: 8, chocFroid: 0.15,
    conseils: [
      'Forme de grandes colonies : repère un pied puis regarde au ras du sol autour.',
      'Supporte le froid : c’est l’espèce de fin de saison, quand les cèpes s’arrêtent.',
    ],
    confusions: 'Vérifier les plis décurrents (pas de vraies lames) et le pied creux jaune-gris. Ne pas confondre avec de petits cortinaires bruns, dont certains sont mortels.',
  },
  {
    id: 'lactaire-delicieux', ordre: 4, nom: 'Lactaire délicieux', latin: 'Lactarius deliciosus',
    habitats: ['pin', 'conifere', 'melange'],
    arbres: 'Pins, y compris pin maritime : jeunes pinèdes, lisières herbeuses, bords de chemins.',
    mois: [9, 10, 11, 12], pluieMm: 25, pluieJours: 5, latenceMin: 7, latencePic: 10, latenceMax: 15,
    tmoyMin: 6, tmoyMax: 16, vieillissement: 1, gelSeuil: -1, gelNuits: 2, chaleurMax: 25, secJours: 6, chocFroid: 0.08,
    conseils: [
      'Préfère les jeunes plantations et l’herbe en bordure de pinède.',
      'Casse une lame : un lait orange carotte qui verdit en séchant est le bon signe.',
    ],
    confusions: 'Lactaires à lait blanc, ou dont le lait vire au violet : à laisser. Le lactaire sanguin (lait rouge vin) est aussi comestible.',
  },
];
