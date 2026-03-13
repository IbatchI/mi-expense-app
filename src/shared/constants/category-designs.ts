/**
 * Category design system for frontend optimization
 * Provides consistent colors, icons, and styling for expense categories
 */

export interface CategoryDesign {
  icon: string;
  color: string; // Primary color for charts/buttons
  lightColor: string; // Background color for cards
  textColor: string; // Text color on primary background
}

export const CATEGORY_DESIGNS: Record<string, CategoryDesign> = {
  Alimentación: {
    icon: "🍔",
    color: "#FF6B6B",
    lightColor: "#FFE5E5",
    textColor: "#FFFFFF",
  },
  Viajes: {
    icon: "✈️",
    color: "#4ECDC4",
    lightColor: "#E5F9F6",
    textColor: "#FFFFFF",
  },
  "Ocio y Entretenimiento": {
    icon: "🎮",
    color: "#45B7D1",
    lightColor: "#E5F3FF",
    textColor: "#FFFFFF",
  },
  Salud: {
    icon: "💊",
    color: "#96CEB4",
    lightColor: "#F0F9F4",
    textColor: "#FFFFFF",
  },
  "Compras Personales": {
    icon: "🛍️",
    color: "#FFEAA7",
    lightColor: "#FFFBEF",
    textColor: "#2D3436",
  },
  Indumentaria: {
    icon: "👕",
    color: "#FFEAA7",
    lightColor: "#FFFBEF",
    textColor: "#2D3436",
  },
  "Belleza y Cuidado Personal": {
    icon: "💄",
    color: "#FD79A8",
    lightColor: "#FFF0F6",
    textColor: "#FFFFFF",
  },
  Hogar: {
    icon: "🏠",
    color: "#DDA0DD",
    lightColor: "#F5F0F5",
    textColor: "#FFFFFF",
  },
  Educación: {
    icon: "📚",
    color: "#74B9FF",
    lightColor: "#EBF4FF",
    textColor: "#FFFFFF",
  },
  Mascotas: {
    icon: "🐕",
    color: "#FD79A8",
    lightColor: "#FFF0F6",
    textColor: "#FFFFFF",
  },
  "Trabajo / Negocio": {
    icon: "💼",
    color: "#6C5CE7",
    lightColor: "#F0EFFF",
    textColor: "#FFFFFF",
  },
  Descuentos: {
    icon: "💸",
    color: "#00B894",
    lightColor: "#E8F7F1",
    textColor: "#FFFFFF",
  },
  "Sin Categoría": {
    icon: "❓",
    color: "#636E72",
    lightColor: "#F8F9FA",
    textColor: "#FFFFFF",
  },
};

export const DEFAULT_CATEGORY_DESIGN: CategoryDesign =
  CATEGORY_DESIGNS["Sin Categoría"];

export function getCategoryDesign(categoryName: string): CategoryDesign {
  return CATEGORY_DESIGNS[categoryName] || DEFAULT_CATEGORY_DESIGN;
}
