// Mock playerSchema — calc.js'in import ettiği sabitler
export const ATTRS = [
  'passing','shooting','tackling','dribbling','finishing','crossing',
  'composure','vision','decisions','firstTouch','reflexes','agility',
  'pace','longShots','interception','aerial','marking','positioning',
  'leadership','aggression','flair'
];

export const ROLE_WEIGHTS = {
  GK: { reflexes: 1.3, positioning: 1.2, composure: 1.1, passing: 0.9 },
  DF: { tackling: 1.3, marking: 1.2, interception: 1.1, aerial: 1.1, passing: 0.9 },
  OS: { passing: 1.3, vision: 1.2, decisions: 1.1, firstTouch: 1.0, dribbling: 0.9 },
  FV: { finishing: 1.3, composure: 1.2, shooting: 1.1, pace: 1.0, firstTouch: 1.0 },
};

export const STAR_TRAITS = {};
