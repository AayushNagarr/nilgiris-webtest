import cardsJson from "@/data/cards.json";
import personalitiesJson from "@/data/personalities.json";
import { CardDefinition, CardId, PersonalityDefinition, PersonalityId } from "./types";

export const CARD_LIST = cardsJson as CardDefinition[];
export const CARDS: Record<CardId, CardDefinition> = Object.fromEntries(
  CARD_LIST.map((card) => [card.id, card])
);

export const PERSONALITIES = personalitiesJson as PersonalityDefinition[];

export function starterDeck(personalityId: PersonalityId): CardId[] {
  const personality = PERSONALITIES.find((p) => p.id === personalityId) ?? PERSONALITIES[0];
  const deck: CardId[] = [];
  for (const card of CARD_LIST) {
    for (let i = 0; i < (card.starterCopies ?? 0); i++) deck.push(card.id);
  }
  deck.push(personality.starterCardId);
  return deck;
}

export function normalRewardPool(personalityId?: PersonalityId, roomNumber = 1): CardDefinition[] {
  const personality = PERSONALITIES.find((p) => p.id === personalityId);
  return CARD_LIST.filter((card) => {
    if (!card.reward || card.craftingPool) return false;
    if (card.personality && card.personality !== personality?.name) return false;
    if ((card.unlockRoom ?? 1) > roomNumber) return false;
    return true;
  });
}

export function craftingPool(pool: "inspired" | "experimental"): CardDefinition[] {
  return CARD_LIST.filter((card) => card.craftingPool === pool);
}
