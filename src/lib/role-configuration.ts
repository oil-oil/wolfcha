import type { Role } from "@/types/game";

const ROLE_CONFIGURATIONS: Record<number, Role[]> = {
  8: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"],
  9: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager", "Villager"],
  10: ["Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager", "Villager"],
  11: ["Werewolf", "Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager", "Villager"],
  12: ["Werewolf", "Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager", "Villager", "Villager"],
};

export function getRoleConfiguration(playerCount: number): Role[] {
  return [...(ROLE_CONFIGURATIONS[playerCount] ?? ROLE_CONFIGURATIONS[10])];
}
