import type {
  LocalityDTO,
  PostcodeCoverageDTO,
  SamedayDeclarationInput,
  SamedayDeclarationViewDTO,
} from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for the shop's same-day declaration (032). Screens never touch the api client
// directly (Principle VI).
//
// ⚠ THERE IS NO PRICING CALL IN THIS FILE, AND THERE IS NO ROUTE TO MAKE ONE. Delivery fees are the
// platform's decision (FR-008); the shop service defines no pricing path at any verb.

export async function getSamedayDeclaration(): Promise<SamedayDeclarationViewDTO> {
  return api.get<SamedayDeclarationViewDTO>("/shop/v1/delivery-sameday");
}

export async function submitSamedayDeclaration(
  body: SamedayDeclarationInput,
): Promise<SamedayDeclarationViewDTO> {
  return api.put<SamedayDeclarationViewDTO>("/shop/v1/delivery-sameday", body);
}

/** Find real places by name (or by postcode — the server classifies the query). */
export async function searchLocalities(q: string): Promise<LocalityDTO[]> {
  return api.get<LocalityDTO[]>(`/shop/v1/delivery-localities?q=${encodeURIComponent(q)}`);
}

/**
 * What a postcode actually covers — ⚠ the data behind the disclosure.
 *
 * Choosing "Alfredton" commits the shop to all twenty Ballarat localities, because serviceability is
 * postcode-decided everywhere. The console must say so before the shop confirms.
 */
export async function postcodeCoverage(postcode: string): Promise<PostcodeCoverageDTO> {
  return api.get<PostcodeCoverageDTO>(
    `/shop/v1/delivery-localities?coverage=${encodeURIComponent(postcode)}`,
  );
}
