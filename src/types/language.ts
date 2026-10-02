/** Referencia mínima a un idioma, la que viaja dentro de un mazo. */
export interface LanguageRef {
  id: string;
  /** Código ISO 639-1 en minúsculas. */
  code: string;
  name: string;
  flag: string | null;
}

/** Idioma del catálogo del usuario, con los datos que necesitan los selectores. */
export interface LanguageView extends LanguageRef {
  sortOrder: number;
  /** Mazos del usuario asignados a este idioma. */
  deckCount: number;
}