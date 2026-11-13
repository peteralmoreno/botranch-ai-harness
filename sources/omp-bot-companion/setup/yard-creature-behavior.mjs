export const HAY_RADIUS=420, HUNGRY_AT=25, FULL_AT=90, ANIMAL_LIMIT=32;
export const appetite={cow:3,sheep:4,chicken:5}; // Fullness lost per minute while away from food.
export function updateFullness(animal,seconds,atHay){
 const elapsed=Math.max(0,seconds);
 animal.fullness=Math.max(0,Math.min(100,animal.fullness+(atHay?18:-(appetite[animal.type]||4))*elapsed/60));
 return animal.fullness;
}
export function wantsHay(animal){return animal.fullness<FULL_AT&&(animal.eating||animal.fullness<=HUNGRY_AT);}
